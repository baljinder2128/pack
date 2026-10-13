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
await db.query(`update trips set status='in_progress', started_at=now() where id='${tripD}'`);
await as(O, `delete from trips where id='${tripD}'`);
check('started trips cannot be deleted, even by office', (await db.query(`select 1 from trips where id='${tripD}'`)).rows.length === 1);
await as(O, `update inspections set archived_at=now(), archived_by='${O}'`);
check('office archives an inspection', (await db.query(`select count(*)::int n from inspections where archived_at is not null`)).rows[0].n === 1);
check('inspections cannot be deleted', (await as(O, `delete from inspections returning *`)).length === 0);
check('office stores an RCTI PDF', !String(await as(O, `insert into storage.objects (bucket_id,name) values ('rcti-pdfs','${D}/RCTI-1.pdf')`)).startsWith('ERR'));
check('driver cannot store RCTI PDFs', String(await as(D, `insert into storage.objects (bucket_id,name) values ('rcti-pdfs','${D}/RCTI-2.pdf')`)).startsWith('ERR'));
check('driver reads own RCTI PDF', (await as(D, `select * from storage.objects where bucket_id='rcti-pdfs'`)).length === 1);
check('other driver cannot read it', (await as(D2, `select * from storage.objects where bucket_id='rcti-pdfs'`)).length === 0);
await q(fs.readFileSync(new URL('../migrations/0005_rcti_archive.sql', import.meta.url), 'utf8'));
check('0005 can be run twice', true);
await as(D, `update profiles set pay_type='tfn', tax_scale='no_tfn', has_study_loan=true where id='${D}'`);
r = (await db.query(`select pay_type,tax_scale,has_study_loan from profiles where id='${D}'`)).rows[0];
check('driver cannot change own pay or tax settings', r.pay_type==='abn' && r.tax_scale==='tft' && r.has_study_loan===false);
await as(O, `update profiles set pay_type='tfn', employment_type='full_time' where id='${D}'`);
check('office sets TFN employee', (await db.query(`select pay_type from profiles where id='${D}'`)).rows[0].pay_type==='tfn');
check('pay type must be abn or tfn', String(await as(O, `update profiles set pay_type='cash' where id='${D}'`)).startsWith('ERR'));
const slip = `insert into payslips (employee_id,week_start,week_end,pay_date,gross,tax,net,super,ytd_gross,ytd_tax,ytd_super) values ('${D}','2026-10-12','2026-10-17','2026-10-19',1000,138,862,120,1000,138,120)`;
check('driver cannot issue a payslip', String(await as(D, slip)).startsWith('ERR'));
check('office issues a payslip', !String(await as(O, slip + ` on conflict (employee_id,week_start) do update set gross=excluded.gross`)).startsWith('ERR'));
check('employee reads own payslip', (await as(D, `select * from payslips`)).length===1);
check('other driver cannot read it', (await as(D2, `select * from payslips`)).length===0);
check('payslips cannot be deleted', (await as(O, `delete from payslips returning *`)).length===0);
check('office stores a payslip PDF', !String(await as(O, `insert into storage.objects (bucket_id,name) values ('payslip-pdfs','${D}/Payslip-1.pdf')`)).startsWith('ERR'));
check('employee reads own payslip PDF', (await as(D, `select * from storage.objects where bucket_id='payslip-pdfs'`)).length===1);
check('other driver cannot read payslip PDF', (await as(D2, `select * from storage.objects where bucket_id='payslip-pdfs'`)).length===0);
check('driver cannot save a TFN', String(await as(D, `insert into employee_tfns (employee_id,tfn) values ('${D}','123456782')`)).startsWith('ERR'));
check('office saves a TFN', !String(await as(O, `insert into employee_tfns (employee_id,tfn) values ('${D}','123456782')`)).startsWith('ERR'));
check('driver cannot read TFNs, even their own', (await as(D, `select * from employee_tfns`)).length===0);
check('office reads TFN', (await as(O, `select * from employee_tfns`)).length===1);
await q(fs.readFileSync(new URL('../migrations/0006_payslips.sql', import.meta.url), 'utf8'));
check('0006 can be run twice', true);
check('driver cannot delete an RCTI', (await as(D, `delete from rctis returning *`)).length===0);
check('driver cannot delete an RCTI PDF', (await as(D, `delete from storage.objects where bucket_id='rcti-pdfs' returning *`)).length===0);
check('office deletes an RCTI', (await as(O, `delete from rctis returning *`)).length>=1);
check('office deletes an RCTI PDF', (await as(O, `delete from storage.objects where bucket_id='rcti-pdfs' returning *`)).length>=1);
check('RCTI numbers are not reused after a delete', Number((await as(O, `insert into rctis (driver_id,week_start,week_end,subtotal,gst,total) values ('${D}','2026-10-19','2026-10-24',1,0,1) returning number`))[0].number) > 1);
await q(fs.readFileSync(new URL('../migrations/0007_delete_rctis.sql', import.meta.url), 'utf8'));
check('0007 can be run twice', true);
const rs = (uid) => `insert into runsheets (driver_id,run_date,photo_paths) values ('${uid}','2026-10-13','{a.jpg}') returning id`;
check('driver submits own runsheet', !String(await as(D, rs(D))).startsWith('ERR'));
check('driver cannot submit for someone else', String(await as(D, rs(D2))).startsWith('ERR'));
check('driver reads own runsheets', (await as(D, `select * from runsheets`)).length===1);
check('other driver cannot read them', (await as(D2, `select * from runsheets`)).length===0);
check('office reads all runsheets', (await as(O, `select * from runsheets`)).length===1);
check('driver cannot mark reviewed', (await as(D, `update runsheets set reviewed_at=now() returning *`)).length===0);
check('office marks reviewed', (await as(O, `update runsheets set reviewed_at=now() returning *`)).length===1);
check('other driver cannot delete runsheets', (await as(D2, `delete from runsheets returning *`)).length===0);
check('driver uploads own runsheet photo', !String(await as(D, `insert into storage.objects (bucket_id,name) values ('runsheet-photos','${D}/r/1.jpg')`)).startsWith('ERR'));
check('driver cannot upload to another folder', String(await as(D, `insert into storage.objects (bucket_id,name) values ('runsheet-photos','${D2}/r/1.jpg')`)).startsWith('ERR'));
check('office reads runsheet photos', (await as(O, `select * from storage.objects where bucket_id='runsheet-photos'`)).length===1);
check('other driver cannot read runsheet photos', (await as(D2, `select * from storage.objects where bucket_id='runsheet-photos'`)).length===0);
await q(fs.readFileSync(new URL('../migrations/0008_runsheets.sql', import.meta.url), 'utf8'));
check('0008 can be run twice', true);
// Permanent delete (manage-driver 'delete'): the same clean-up steps, as the service role.
await q(`insert into trips (driver_id,pickup,dropoff,created_by) values ('${D2}','P','Q','${D2}');
insert into shifts (driver_id,start_at,end_at) values ('${D2}','2026-10-13T06:00Z','2026-10-13T10:00Z');
insert into inspections (driver_id) values ('${D2}');
insert into runsheets (driver_id,run_date) values ('${D2}','2026-10-13');
update trips set archived_by='${D2}' where driver_id='${D}';`);
for (const [t, c, how] of [['trips','created_by','unlink'],['trips','archived_by','unlink'],['inspections','archived_by','unlink'],['rctis','issued_by','unlink'],['payslips','issued_by','unlink'],['employee_tfns','updated_by','unlink'],['runsheets','reviewed_by','unlink'],['runsheets','driver_id','delete'],['inspections','driver_id','delete'],['shifts','driver_id','delete'],['trips','driver_id','delete'],['driver_locations','driver_id','delete'],['employee_tfns','employee_id','delete']])
  await q(how === 'delete' ? `delete from ${t} where ${c}='${D2}'` : `update ${t} set ${c}=null where ${c}='${D2}'`);
let delErr = null; try { await q(`delete from auth.users where id='${D2}'`); } catch (e) { delErr = e.message; }
check('permanent delete clears every link to the person' + (delErr ? ` (${delErr})` : ''), !delErr && (await db.query(`select 1 from profiles where id='${D2}'`)).rows.length === 0);
check('other drivers keep their records', (await db.query(`select 1 from trips where driver_id='${D}'`)).rows.length > 0);
// Re-running 0006 above reset protect_profile_fields, so apply 0009 again first.
await q(fs.readFileSync(new URL('../migrations/0009_licence_renewals.sql', import.meta.url), 'utf8'));
await as(O, `update profiles set licence_expiry='2027-01-01' where id='${D}'`);
await as(D, `update profiles set licence_expiry='2030-01-01', phone='0400' where id='${D}'`);
const lic = (await db.query(`select licence_expiry::text, phone from profiles where id='${D}'`)).rows[0];
check('driver cannot change own licence expiry', lic.licence_expiry === '2027-01-01' && lic.phone === '0400');
check('driver sends own licence renewal', !String(await as(D, `insert into licence_renewals (driver_id,new_expiry) values ('${D}','2030-01-01')`)).startsWith('ERR'));
check('driver cannot send renewal for someone else', String(await as(D, `insert into licence_renewals (driver_id,new_expiry) values ('${O}','2030-01-01')`)).startsWith('ERR'));
check('office reads licence renewals', (await as(O, `select * from licence_renewals`)).length===1);
check('licence renewals cannot be edited by drivers', (await as(D, `update licence_renewals set new_expiry='2040-01-01' returning *`)).length===0);
check('driver uploads own licence photo', !String(await as(D, `insert into storage.objects (bucket_id,name) values ('licence-photos','${D}/x/1.jpg')`)).startsWith('ERR'));
check('office reads licence photos', (await as(O, `select * from storage.objects where bucket_id='licence-photos'`)).length===1);
await q(fs.readFileSync(new URL('../migrations/0009_licence_renewals.sql', import.meta.url), 'utf8'));
check('0009 can be run twice', true);

// 0010: hours in a week with an issued RCTI or payslip are office-only.
await as(D, `insert into shifts (driver_id,shift_date,start_at,end_at) values ('${D}','2026-10-05','2026-10-05 07:00+10','2026-10-05 15:00+10')`);
check('driver adds hours in an unpaid week', (await as(D, `select * from shifts where shift_date='2026-10-05'`)).length===1);
await as(O, `insert into rctis (driver_id,week_start,week_end,subtotal,gst,total) values ('${D}','2026-10-05','2026-10-10',1,0,1)`);
check('paid week hours leave the driver app', (await as(D, `select * from shifts where shift_date='2026-10-05'`)).length===0);
check('driver cannot add hours to a paid week', String(await as(D, `insert into shifts (driver_id,shift_date,start_at,end_at) values ('${D}','2026-10-06','2026-10-06 07:00+10','2026-10-06 15:00+10')`)).startsWith('ERR'));
check('driver cannot delete paid week hours', (await as(D, `delete from shifts where shift_date='2026-10-05' returning *`)).length===0);
await as(D, `insert into shifts (driver_id,shift_date,start_at,end_at) values ('${D}','2026-11-30','2026-11-30 07:00+10','2026-11-30 15:00+10')`);
check('driver cannot move hours into a paid week', String(await as(D, `update shifts set shift_date='2026-10-07' where shift_date='2026-11-30'`)).startsWith('ERR'));
check('office still edits paid week hours', (await as(O, `update shifts set break_minutes=30 where shift_date='2026-10-05' returning *`)).length===1);
await q(fs.readFileSync(new URL('../migrations/0010_pay_lock.sql', import.meta.url), 'utf8'));
check('0010 can be run twice', true);
// 0011: drivers delete their own unchecked runsheets; office deletes any.
await q(fs.readFileSync(new URL('../migrations/0011_delete_runsheets.sql', import.meta.url), 'utf8'));
await as(D, `insert into runsheets (driver_id,run_date) values ('${D}','2026-10-13')`);
await as(D, `insert into runsheets (driver_id,run_date) values ('${D}','2026-10-14')`);
await as(O, `update runsheets set reviewed_at=now() where driver_id='${D}' and run_date='2026-10-14'`);
check('driver deletes own unchecked runsheet', (await as(D, `delete from runsheets where run_date='2026-10-13' and driver_id='${D}' returning *`)).length===1);
check('driver cannot delete a checked runsheet', (await as(D, `delete from runsheets where run_date='2026-10-14' and driver_id='${D}' returning *`)).length===0);
check('office deletes a checked runsheet', (await as(O, `delete from runsheets where run_date='2026-10-14' and driver_id='${D}' returning *`)).length===1);
await as(D, `insert into storage.objects (bucket_id,name) values ('runsheet-photos','${D}/r/1.jpg')`);
check('driver deletes own runsheet photo', (await as(D, `delete from storage.objects where bucket_id='runsheet-photos' and name='${D}/r/1.jpg' returning *`)).length>=1);
await q(fs.readFileSync(new URL('../migrations/0011_delete_runsheets.sql', import.meta.url), 'utf8'));
check('0011 can be run twice', true);
// 0012: fuel dockets live in runsheets with kind = 'fuel'.
check('driver submits a fuel docket', !String(await as(D, `insert into runsheets (driver_id,run_date,kind,litres,fuel_cost) values ('${D}','2026-10-13','fuel',350,680.5)`)).startsWith('ERR'));
check('office sees fuel dockets', (await as(O, `select * from runsheets where kind='fuel'`)).length===1);
check('old runsheets default to runsheet', (await db.query(`select count(*)::int n from runsheets where kind <> 'fuel' and kind <> 'runsheet'`)).rows[0].n===0);
check('unknown kind rejected', String(await as(D, `insert into runsheets (driver_id,run_date,kind) values ('${D}','2026-10-13','pizza')`)).startsWith('ERR'));
await q(fs.readFileSync(new URL('../migrations/0012_fuel_dockets.sql', import.meta.url), 'utf8'));
check('0012 can be run twice', true);
// 0013: load acceptance and the office email setting.
await q(fs.readFileSync(new URL('../migrations/0013_load_accept_office_email.sql', import.meta.url), 'utf8'));
await as(O, `insert into trips (driver_id,pickup,dropoff,status) values ('${D}','Botany','Wetherill Park','planned')`);
check('driver accepts own planned load', (await as(D, `update trips set accepted_at=now() where driver_id='${D}' and pickup='Botany' returning *`)).length===1);
check('other driver cannot accept it', (await as(D2, `update trips set accepted_at=now() where pickup='Botany' returning *`)).length===0);
check('office email defaults to sbtruckin', (await db.query(`select office_email from company`)).rows[0].office_email==='sbtruckin@outlook.com');
check('office changes office email', (await as(O, `update company set office_email='new@x.com' returning *`)).length===1);
check('driver cannot change office email', (await as(D, `update company set office_email='evil@x.com' returning *`)).length===0);
await q(fs.readFileSync(new URL('../migrations/0013_load_accept_office_email.sql', import.meta.url), 'utf8'));
check('0013 can be run twice', true);
// 0014: office manages trucks and trailers; drivers read them.
await q(fs.readFileSync(new URL('../migrations/0014_fleet.sql', import.meta.url), 'utf8'));
check('office adds a truck', !String(await as(O, `insert into vehicles (kind,rego) values ('truck','XQ12AB')`)).startsWith('ERR'));
check('driver reads trucks', (await as(D, `select * from vehicles`)).length===1);
check('driver cannot add a truck', String(await as(D, `insert into vehicles (kind,rego) values ('truck','HACK1')`)).startsWith('ERR'));
check('driver cannot remove a truck', (await as(D, `update vehicles set active=false returning *`)).length===0);
check('office removes a truck', (await as(O, `update vehicles set active=false returning *`)).length===1);
check('trip saves a Visy trailer number', !String(await as(D, `insert into trips (driver_id,pickup,dropoff,visy_trailer) values ('${D}','A','B','V123')`)).startsWith('ERR'));
await q(fs.readFileSync(new URL('../migrations/0014_fleet.sql', import.meta.url), 'utf8'));
check('0014 can be run twice', true);
// 0015: fleet numbers.
await q(fs.readFileSync(new URL('../migrations/0015_fleet_numbers.sql', import.meta.url), 'utf8'));
check('office sets a trailer fleet number', !String(await as(O, `insert into vehicles (kind,rego,fleet_number) values ('trailer','TR55','12') on conflict (kind,rego) do update set fleet_number=excluded.fleet_number`)).startsWith('ERR'));
check('driver reads fleet numbers', (await as(D, `select fleet_number from vehicles where rego='TR55'`))[0]?.fleet_number==='12');
await q(fs.readFileSync(new URL('../migrations/0015_fleet_numbers.sql', import.meta.url), 'utf8'));
check('0015 can be run twice', true);
// 0016: customer places.
await q(fs.readFileSync(new URL('../migrations/0016_places.sql', import.meta.url), 'utf8'));
check('office adds a place', !String(await as(O, `insert into places (name,address) values ('Visy Smithfield','12 Long St')`)).startsWith('ERR'));
check('driver reads places', (await as(D, `select * from places`)).length===1);
check('driver cannot add a place', String(await as(D, `insert into places (name) values ('Hack')`)).startsWith('ERR'));
check('driver cannot remove a place', (await as(D, `update places set active=false returning *`)).length===0);
await q(fs.readFileSync(new URL('../migrations/0016_places.sql', import.meta.url), 'utf8'));
check('0016 can be run twice', true);
// 0017: office deletes planned loads only.
await q(fs.readFileSync(new URL('../migrations/0017_delete_planned_loads.sql', import.meta.url), 'utf8'));
const [pl] = await as(O, `insert into trips (driver_id,trip_date,truck_rego,pickup,dropoff) values ('${D}','2026-12-01','X1','A','B') returning id`);
check('driver cannot delete a planned load', (await as(D, `delete from trips where id='${pl.id}' returning id`)).length===0);
check('office deletes a planned load', (await as(O, `delete from trips where id='${pl.id}' returning id`)).length===1);
const [st] = await as(O, `insert into trips (driver_id,trip_date,truck_rego,pickup,dropoff,status,started_at) values ('${D}','2026-12-01','X1','A','B','in_progress',now()) returning id`);
check('office cannot delete a started trip', (await as(O, `delete from trips where id='${st.id}' returning id`)).length===0);
if (failed) process.exit(1);
