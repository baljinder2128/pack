import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

// Loads the migration into an in-memory Postgres with stubbed Supabase
// auth/storage schemas and checks the row level security rules.
// Run: npm run test:db
const db = new PGlite();
const q = (s) => db.exec(s);
await q(`
create role authenticated; create role anon;
create schema auth; create schema storage;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id serial, bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
grant usage on schema auth, storage, public to authenticated; grant all on storage.objects to authenticated; grant all on sequence storage.objects_id_seq to authenticated;
`);
for (const f of fs.readdirSync(new URL('../migrations/', import.meta.url)).sort()) {
  await q(fs.readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
}
await q(`grant all on all tables in schema public to authenticated; grant all on all sequences in schema public to authenticated;`);
const O='00000000-0000-0000-0000-00000000000a', D='00000000-0000-0000-0000-00000000000d', D2='00000000-0000-0000-0000-0000000000d2';
await q(`insert into auth.users (id,email,raw_user_meta_data,raw_app_meta_data) values
 ('${O}','o@x','{"full_name":"Office"}','{"role":"office"}'),
 ('${D}','d@x','{"full_name":"Dan"}','{}'),('${D2}','e@x','{"full_name":"Eve"}','{"role":"hacker"}')`);
const as = async (uid, sql) => { await q(`set role authenticated; select set_config('request.uid','${uid}',false);`); try { return (await db.query(sql)).rows; } catch(e){ return 'ERR: '+e.message; } finally { await q(`reset role;`);} };
let failed = 0;
const check = (name, cond) => { if (!cond) failed++; console.log((cond ? 'PASS ' : 'FAIL ') + name); };
check('role only comes from app_metadata', (await db.query(`select role from profiles where email='e@x'`)).rows[0].role === 'driver');
await as(D, `update profiles set role='office', hourly_rate=99, phone='123' where id='${D}'`);
let r = (await db.query(`select role,hourly_rate,phone from profiles where id='${D}'`)).rows[0];
check('driver cannot promote self or set rate, can set phone', r.role==='driver' && Number(r.hourly_rate)===0 && r.phone==='123');
await as(O, `update profiles set hourly_rate=40 where id='${D}'`);
check('office sets rate', Number((await db.query(`select hourly_rate from profiles where id='${D}'`)).rows[0].hourly_rate)===40);
await as(D, `insert into trips (driver_id, pickup, dropoff, truck_rego, amount) values ('${D}','A','B','T1',500)`);
check('driver trip amount forced to 0', Number((await db.query(`select amount from trips where driver_id='${D}'`)).rows[0].amount)===0);
check('driver cannot insert trip for someone else', String(await as(D, `insert into trips (driver_id,pickup,dropoff) values ('${D2}','A','B')`)).startsWith('ERR'));
await as(O, `insert into trips (driver_id,pickup,dropoff,amount) values ('${D2}','X','Y',300)`);
check('office trip amount kept', Number((await db.query(`select amount from trips where driver_id='${D2}'`)).rows[0].amount)===300);
check('driver sees only own trips', (await as(D, `select * from trips`)).length===1);
check('office sees all trips', (await as(O, `select * from trips`)).length===2);
check('location rejected off duty', String(await as(D, `insert into driver_locations (driver_id,lat,lng) values ('${D}',1,2)`)).startsWith('ERR'));
await as(D, `update profiles set tracking_consent_at=now(), on_duty=true, on_duty_since=now() - interval '1 minute' where id='${D}'`);
check('location accepted on duty', !String(await as(D, `insert into driver_locations (driver_id,lat,lng) values ('${D}',-37.8,144.9)`)).startsWith('ERR'));
check('office sees live driver', (await as(O, `select * from live_drivers`)).length===1);
check('other driver sees no live drivers', (await as(D2, `select * from live_drivers`)).length===0);
check('driver cannot issue rcti', String(await as(D, `insert into rctis (driver_id,week_start,week_end,subtotal,gst,total) values ('${D}','2026-10-12','2026-10-18',1,0,1)`)).startsWith('ERR'));
check('office can upsert rcti', !String(await as(O, `insert into rctis (driver_id,week_start,week_end,subtotal,gst,total) values ('${D}','2026-10-12','2026-10-18',1,0,1) on conflict (driver_id,week_start) do update set total=excluded.total`)).startsWith('ERR'));
check('driver reads company', (await as(D, `select * from company`)).length===1);
check('driver cannot edit company', (await as(D, `update company set name='x' returning *`)).length===0);
check('driver uploads own photo', !String(await as(D, `insert into storage.objects (bucket_id,name) values ('inspection-photos','${D}/i/1.jpg')`)).startsWith('ERR'));
check('driver cannot upload to other folder', String(await as(D, `insert into storage.objects (bucket_id,name) values ('inspection-photos','${D2}/i/1.jpg')`)).startsWith('ERR'));
check('driver inserts own inspection', !String(await as(D, `insert into inspections (driver_id,truck_rego,items) values ('${D}','T1','[{"key":"tyres","ok":false}]')`)).startsWith('ERR'));
check('other driver cannot read it', (await as(D2, `select * from inspections`)).length===0);
const tripD = (await db.query(`select id from trips where driver_id='${D}'`)).rows[0].id;
await as(D, `update trips set archived_at=now() where id='${tripD}'`);
check('driver cannot archive a trip', (await db.query(`select archived_at from trips where id='${tripD}'`)).rows[0].archived_at === null);
await as(O, `update trips set archived_at=now(), archived_by='${O}' where id='${tripD}'`);
check('office archives a trip', (await db.query(`select archived_at from trips where id='${tripD}'`)).rows[0].archived_at !== null);
await as(O, `delete from trips where id='${tripD}'`);
check('trips cannot be deleted, even by office', (await db.query(`select 1 from trips where id='${tripD}'`)).rows.length === 1);
await as(O, `update inspections set archived_at=now(), archived_by='${O}'`);
check('office archives an inspection', (await db.query(`select count(*)::int n from inspections where archived_at is not null`)).rows[0].n === 1);
check('inspections cannot be deleted', (await as(O, `delete from inspections returning *`)).length === 0);
if (failed) process.exit(1);
