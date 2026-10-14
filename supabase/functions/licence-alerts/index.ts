// Licence expiry alerts and renewals, emailed to the office.
//
// Deploy in the Supabase dashboard (Edge Functions > Deploy a new function),
// name it licence-alerts and turn Verify JWT off.
// Uses the same email secrets as send-payslip: Brevo (BREVO_API_KEY +
// BREVO_SENDER), else Gmail (GMAIL_USER + GMAIL_APP_PASSWORD), else Resend
// (RESEND_API_KEY). Optional: RCTI_EMAIL (office address, default sbtruckin@outlook.com).
//
// Body:
//   {}               -> daily check (run by the GitHub "Licence alerts" workflow and when
//                       the office opens the Drivers page). Emails the office once per
//                       licence that expires within 7 days, so calling it often is harmless.
//   { renewal_id }   -> a driver sent a photo of their renewed licence: email it to the
//                       office and update their expiry date. Needs the driver's sign-in.
//   { runsheet_id }  -> a driver submitted their end-of-day runsheet or a fuel docket:
//                       email the photos to the office. Needs the driver's sign-in.
//   { trip_id }      -> a driver accepted a load the office planned: tell the office.
//   { day_report }   -> a driver is going off duty: log their hours (from the first trip
//                       accepted or entered this shift, to now), take them off duty, and email
//                       the office their day (time on duty, trips, runsheets, fuel dockets,
//                       pre-trip checks). Needs the driver's sign-in.
//   { duty_check }   -> run every 15 minutes by the GitHub "Duty check" workflow: anyone on
//                       duty over 14 hours is taken off duty the same way, and the office and
//                       the driver are emailed about the breach.
//
// Rail bases to Pacific National (trips with kind 'rail') go in the runsheet email.
//
// The daily check also deletes the photos of runsheets, fuel dockets and inspections
// that were checked or archived more than 2 months ago. The records themselves stay.
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const dmy = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

/** Today's date in Sydney as YYYY-MM-DD. */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

type Attachment = { filename: string; base64: string; contentType: string };

// The office address is set on the Company details screen (0013 SQL); before that
// it falls back to the RCTI_EMAIL secret, then sbtruckin@outlook.com.
// deno-lint-ignore no-explicit-any
async function officeEmail(admin: any): Promise<string> {
  const { data } = await admin.from('company').select('office_email').eq('id', 1).maybeSingle();
  return (data as { office_email?: string } | null)?.office_email?.trim() || Deno.env.get('RCTI_EMAIL') || 'sbtruckin@outlook.com';
}

let office = 'sbtruckin@outlook.com';

/** Sends to the office with Brevo, Gmail or Resend (whichever is set up). */
function sendToOffice(subject: string, html: string, attachments: Attachment[] = []): Promise<void> {
  return sendEmail(office, subject, html, attachments);
}

/** Sends with Brevo, Gmail or Resend (whichever is set up). Resend's free sender only reaches the office. */
async function sendEmail(to: string, subject: string, html: string, attachments: Attachment[] = []): Promise<void> {

  const brevoKey = Deno.env.get('BREVO_API_KEY')?.trim();
  const brevoSender = Deno.env.get('BREVO_SENDER')?.trim();
  if (brevoKey && brevoSender) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: 'SBT Truckin', email: brevoSender },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        attachment: attachments.length ? attachments.map((a) => ({ name: a.filename, content: a.base64 })) : undefined,
      }),
    });
    if (!res.ok) throw new Error(`Brevo could not send it: ${(await res.text()).slice(0, 300)}`);
    return;
  }

  const gmailUser = Deno.env.get('GMAIL_USER')?.trim().replace(/^["']|["']$/g, '');
  const gmailPass = Deno.env.get('GMAIL_APP_PASSWORD')?.replace(/[\s"']/g, '');
  if (gmailUser && gmailPass) {
    // Port 465 (SSL): Supabase blocks outgoing 25 and 587.
    const mailer = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: gmailUser, pass: gmailPass } });
    await mailer.sendMail({
      from: `SBT Truckin <${gmailUser}>`,
      to,
      subject,
      html,
      attachments: attachments.map((a) => ({ filename: a.filename, content: a.base64, encoding: 'base64', contentType: a.contentType })),
    });
    return;
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) throw new Error('Email is not configured on the server');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('EMAIL_FROM') ?? 'SBT Truckin <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
      attachments: attachments.map((a) => ({ filename: a.filename, content: a.base64 })),
    }),
  });
  if (!res.ok) throw new Error(`Email failed to send: ${(await res.text()).slice(0, 300)}`);
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { renewal_id, runsheet_id, trip_id, day_report, duty_check } = await req.json().catch(() => ({}));
  office = await officeEmail(admin);

  if (day_report) {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return json({ error: 'Please sign in again' }, 401);
    const { data: me } = await admin.from('profiles').select('*').eq('id', auth.user.id).single();
    if (!me?.on_duty_since) return json({ error: 'No shift to report' }, 400);
    try {
      return json({ ok: true, ...(await endShift(admin, me)) });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
  }

  if (duty_check) {
    const { data: over, error } = await admin
      .from('profiles')
      .select('*')
      .eq('on_duty', true)
      .lt('on_duty_since', new Date(Date.now() - MAX_DUTY_MS).toISOString());
    if (error) return json({ error: error.message }, 500);
    const results = [];
    for (const me of over ?? []) {
      results.push(await endShift(admin, me).then((r) => ({ driver: me.full_name, ...r }), (e) => ({ driver: me.full_name, error: String(e) })));
    }
    return json({ ok: true, takenOffDuty: results.length, results });
  }

  if (trip_id) {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return json({ error: 'Please sign in again' }, 401);
    const { data: trip, error } = await admin
      .from('trips')
      .select('*, driver:profiles!trips_driver_id_fkey(full_name, phone)')
      .eq('id', trip_id)
      .single();
    if (error || !trip) return json({ error: error?.message ?? 'Trip not found' }, 404);
    if (trip.driver_id !== auth.user.id) return json({ error: 'Not your load' }, 403);
    if (!trip.accepted_at) return json({ error: 'This load has not been accepted' }, 400);

    const name = trip.driver?.full_name ?? 'A driver';
    const when = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' }).format(new Date(trip.accepted_at));
    const row = (k: string, v: unknown) => (v ? `<p style="margin:0 0 4px"><b>${k}:</b> ${escapeHtml(v)}</p>` : '');
    const html = `
      <h2 style="margin:0 0 8px">Load accepted: ${escapeHtml(name)}</h2>
      <p style="margin:0 0 8px">${escapeHtml(name)} accepted this load at ${when}.</p>
      ${row('Date', dmy(trip.trip_date))}
      ${row('From', trip.pickup)}
      ${row('To', trip.dropoff)}
      ${row('Customer', trip.customer)}
      ${row('Job', trip.job_ref)}
      ${row('Truck', [trip.truck_rego, trip.trailer_rego].filter(Boolean).join(' / '))}
      ${row('Driver phone', trip.driver?.phone)}`;
    try {
      await sendToOffice(`Load accepted - ${name} - ${trip.pickup || '?'} to ${trip.dropoff || '?'} - ${dmy(trip.trip_date)}`, html);
      return json({ ok: true });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
  }

  if (runsheet_id) {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return json({ error: 'Please sign in again' }, 401);

    const { data: sheet, error } = await admin
      .from('runsheets')
      .select('*, driver:profiles!runsheets_driver_id_fkey(full_name, phone)')
      .eq('id', runsheet_id)
      .single();
    if (error || !sheet) return json({ error: error?.message ?? 'Runsheet not found' }, 404);
    const { data: me } = await admin.from('profiles').select('role').eq('id', auth.user.id).maybeSingle();
    if (sheet.driver_id !== auth.user.id && me?.role !== 'office') return json({ error: 'Not your runsheet' }, 403);

    const name = sheet.driver?.full_name ?? 'A driver';
    const fuel = sheet.kind === 'fuel';
    const label = fuel ? 'Fuel docket' : 'Runsheet';
    const cost = sheet.fuel_cost != null ? `$${Number(sheet.fuel_cost).toFixed(2)}` : '';
    const safeName = name.replace(/[^A-Za-z0-9]+/g, '-');
    const attachments: Attachment[] = [];
    for (const [i, path] of (sheet.photo_paths as string[]).entries()) {
      const { data: blob } = await admin.storage.from('runsheet-photos').download(path);
      if (blob) {
        attachments.push({
          filename: `${fuel ? 'Fuel-docket' : 'Runsheet'}-${safeName}-${sheet.run_date}-${i + 1}.jpg`,
          base64: toBase64(new Uint8Array(await blob.arrayBuffer())),
          contentType: 'image/jpeg',
        });
      }
    }
    // Rail bases to Pacific National go with the runsheet (Billa, 2026-10-14). Empty before the 0019 SQL.
    let railHtml = '';
    let railCount = 0;
    if (!fuel) {
      const { data: me } = await admin.from('profiles').select('on_duty_since').eq('id', sheet.driver_id).maybeSingle();
      const since = me?.on_duty_since;
      const { data: rail } = await admin
        .from('trips')
        .select('base_id, job_ref, trip_date, truck_rego, created_at')
        .eq('driver_id', sheet.driver_id)
        .eq('kind', 'rail')
        .or(`trip_date.eq.${sheet.run_date}${since ? `,created_at.gte.${since}` : ''}`)
        .order('created_at');
      railCount = rail?.length ?? 0;
      railHtml = `<h3 style="margin:12px 0 4px">Rail bases to Pacific National: ${railCount}</h3>${
        railCount
          ? `<table style="border-collapse:collapse;font-size:14px"><tr style="text-align:left;background:#15171c;color:#fff"><th style="padding:6px 10px">Base ID</th><th style="padding:6px 10px">Docket</th><th style="padding:6px 10px">Truck</th></tr>${(rail ?? [])
              .map((b) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(b.base_id)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(b.job_ref)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(b.truck_rego)}</td></tr>`)
              .join('')}</table>`
          : '<p style="margin:0 0 4px">None.</p>'
      }`;
    }
    const html = `
      <h2 style="margin:0 0 8px">${label}: ${escapeHtml(name)} - ${dmy(sheet.run_date)}</h2>
      ${sheet.truck_rego ? `<p style="margin:0 0 4px"><b>Truck:</b> ${escapeHtml(sheet.truck_rego)}</p>` : ''}
      ${sheet.litres != null ? `<p style="margin:0 0 4px"><b>Litres:</b> ${escapeHtml(sheet.litres)}</p>` : ''}
      ${cost ? `<p style="margin:0 0 4px"><b>Cost:</b> ${cost}</p>` : ''}
      ${sheet.driver?.phone ? `<p style="margin:0 0 4px"><b>Phone:</b> ${escapeHtml(sheet.driver.phone)}</p>` : ''}
      ${sheet.notes ? `<p style="margin:0 0 4px"><b>Notes:</b> ${escapeHtml(sheet.notes)}</p>` : ''}
      ${railHtml}
      <p>${attachments.length} photo${attachments.length === 1 ? '' : 's'} of the ${label.toLowerCase()} attached. It is also in the app under Trips &gt; ${fuel ? 'Fuel' : 'Runsheets'}.</p>`;
    try {
      await sendToOffice(
        `${label} - ${name} - ${dmy(sheet.run_date)}${sheet.truck_rego ? ` - ${sheet.truck_rego}` : ''}${cost ? ` - ${cost}` : ''}${railCount ? ` - ${railCount} rail base${railCount === 1 ? '' : 's'}` : ''}`,
        html,
        attachments,
      );
      return json({ ok: true });
    } catch (e) {
      return json({ error: `Saved, but the email to the office failed: ${e instanceof Error ? e.message : String(e)}` }, 502);
    }
  }

  if (renewal_id) {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return json({ error: 'Please sign in again' }, 401);

    const { data: renewal, error } = await admin
      .from('licence_renewals')
      .select('*, driver:profiles!licence_renewals_driver_id_fkey(full_name, email, licence_class, licence_state)')
      .eq('id', renewal_id)
      .single();
    if (error || !renewal) return json({ error: error?.message ?? 'Renewal not found' }, 404);
    const { data: me } = await admin.from('profiles').select('role').eq('id', auth.user.id).maybeSingle();
    if (renewal.driver_id !== auth.user.id && me?.role !== 'office') return json({ error: 'Not your renewal' }, 403);

    // Their licence now runs to the new date; a fresh alert is due a week before that.
    const update: Record<string, unknown> = { licence_expiry: renewal.new_expiry, licence_alert_sent_for: null };
    if (renewal.licence_number) update.licence_number = renewal.licence_number;
    await admin.from('profiles').update(update).eq('id', renewal.driver_id);

    const attachments: Attachment[] = [];
    for (const [i, path] of (renewal.photo_paths as string[]).entries()) {
      const { data: blob } = await admin.storage.from('licence-photos').download(path);
      if (blob) {
        attachments.push({
          filename: `Licence-${(renewal.driver?.full_name ?? 'driver').replace(/[^A-Za-z0-9]+/g, '-')}-${i + 1}.jpg`,
          base64: toBase64(new Uint8Array(await blob.arrayBuffer())),
          contentType: 'image/jpeg',
        });
      }
    }
    const name = renewal.driver?.full_name ?? 'A driver';
    const html = `
      <h2 style="margin:0 0 8px">Licence renewed: ${escapeHtml(name)}</h2>
      <p style="margin:0 0 4px"><b>New expiry:</b> ${dmy(renewal.new_expiry)}</p>
      ${renewal.old_expiry ? `<p style="margin:0 0 4px"><b>Old expiry:</b> ${dmy(renewal.old_expiry)}</p>` : ''}
      ${renewal.licence_number ? `<p style="margin:0 0 4px"><b>Licence number:</b> ${escapeHtml(renewal.licence_number)}</p>` : ''}
      <p>Photos of the new licence are attached. The app has updated the expiry date; please check the photos match.</p>`;
    try {
      await sendToOffice(`Licence renewed - ${name} - expires ${dmy(renewal.new_expiry)}`, html, attachments);
      await admin.from('licence_renewals').update({ emailed_at: new Date().toISOString(), email_error: null }).eq('id', renewal_id);
      return json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await admin.from('licence_renewals').update({ email_error: message }).eq('id', renewal_id);
      return json({ error: `Saved, but the email to the office failed: ${message}` }, 502);
    }
  }

  // Two months after a runsheet/fuel docket is checked or an inspection is archived,
  // its photos are deleted to save space. The record (dates, regos, notes, litres) is kept.
  const photosRemoved = await removeOldPhotos(admin).catch((e) => `failed: ${e instanceof Error ? e.message : e}`);

  // Daily check: active drivers whose licence expires within 7 days (or has expired)
  // and haven't been alerted for this expiry date yet.
  const now = today();
  const { data: due, error } = await admin
    .from('profiles')
    .select('id, full_name, phone, licence_number, licence_class, licence_state, licence_expiry, licence_alert_sent_for')
    .eq('active', true)
    .eq('role', 'driver')
    .not('licence_expiry', 'is', null)
    .lte('licence_expiry', addDays(now, 7));
  if (error) return json({ error: error.message }, 500);
  const fresh = (due ?? []).filter((d) => d.licence_alert_sent_for !== d.licence_expiry);
  if (!fresh.length) return json({ ok: true, alerted: 0, photosRemoved });

  const rows = fresh
    .sort((a, b) => a.licence_expiry.localeCompare(b.licence_expiry))
    .map((d) => {
      const left = daysBetween(now, d.licence_expiry);
      const when = left < 0 ? `<b style="color:#c0262d">expired ${-left} day${left === -1 ? '' : 's'} ago</b>` : left === 0 ? '<b style="color:#c0262d">expires today</b>' : `expires in ${left} day${left === 1 ? '' : 's'}`;
      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee"><b>${escapeHtml(d.full_name)}</b><br>${escapeHtml(d.phone ?? '')}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml([d.licence_class, d.licence_state].filter(Boolean).join(' '))}<br>${escapeHtml(d.licence_number ?? '')}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${dmy(d.licence_expiry)}<br>${when}</td>
      </tr>`;
    })
    .join('');
  const html = `
    <h2 style="margin:0 0 8px">Driver licence renewal needed</h2>
    <p>${fresh.length === 1 ? 'This driver’s licence expires' : 'These drivers’ licences expire'} within a week. Please ask them to renew it and send a photo of the new licence from the SBT Truckin app (Trips tab).</p>
    <table style="border-collapse:collapse;font-size:14px">
      <tr style="text-align:left;background:#15171c;color:#fff"><th style="padding:6px 10px">Driver</th><th style="padding:6px 10px">Licence</th><th style="padding:6px 10px">Expiry</th></tr>
      ${rows}
    </table>`;
  try {
    await sendToOffice(
      fresh.length === 1
        ? `ALERT: ${fresh[0].full_name}'s licence needs renewal by ${dmy(fresh[0].licence_expiry)}`
        : `ALERT: ${fresh.length} driver licences need renewal`,
      html,
    );
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
  for (const d of fresh) await admin.from('profiles').update({ licence_alert_sent_for: d.licence_expiry }).eq('id', d.id);
  return json({ ok: true, alerted: fresh.length, photosRemoved });
});

// deno-lint-ignore no-explicit-any
async function removeOldPhotos(admin: any): Promise<number> {
  const cutoff = new Date(Date.now() - 61 * 86400_000).toISOString();
  let removed = 0;
  for (const [table, bucket, done] of [
    ['runsheets', 'runsheet-photos', 'reviewed_at'],
    ['inspections', 'inspection-photos', 'archived_at'],
  ] as const) {
    const { data, error } = await admin
      .from(table)
      .select('id, photo_paths')
      .lt(done, cutoff)
      .neq('photo_paths', '{}')
      .limit(200);
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const row of data ?? []) {
      const paths: string[] = row.photo_paths ?? [];
      const { error: e } = await admin.storage.from(bucket).remove(paths);
      if (e) throw new Error(`${bucket}: ${e.message}`);
      await admin.from(table).update({ photo_paths: [] }).eq('id', row.id);
      removed += paths.length;
    }
  }
  return removed;
}

// Longest a driver can stay on duty before they are taken off and it's reported as a breach.
const MAX_DUTY_MS = 14 * 3600_000;

/**
 * Ends a driver's shift: logs their hours, takes them off duty and emails the office
 * the day report. Over 14 hours on duty it's a breach: the office and the driver are told.
 *
 * Hours (Billa, 2026-10-14) run from the first trip the driver accepted or entered this
 * shift (or started, for a load accepted earlier; never before going on duty) to now.
 * No trip, no hours. Only the office can change them afterwards.
 */
// deno-lint-ignore no-explicit-any
async function endShift(admin: any, me: any) {
  const since = me.on_duty_since as string;
  const until = new Date().toISOString();
  const breach = Date.parse(until) - Date.parse(since) > MAX_DUTY_MS;
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date(since));
  const [trips, sheets, checks, bases] = await Promise.all([
    admin
      .from('trips')
      .select('*')
      .eq('driver_id', me.id)
      .or(`trip_date.eq.${day},started_at.gte.${since},finished_at.gte.${since},created_at.gte.${since},accepted_at.gte.${since}`)
      .order('started_at'),
    admin.from('runsheets').select('*').eq('driver_id', me.id).gte('submitted_at', since).order('submitted_at'),
    admin.from('inspections').select('truck_rego, trailer_rego, safe_to_drive, items, created_at').eq('driver_id', me.id).gte('created_at', since),
    // Night-shift loaded bases (0018); empty if that SQL isn't run yet.
    admin.from('bases').select('*').eq('driver_id', me.id).eq('kind', 'night_load').gte('created_at', since).order('created_at'),
  ]);

  // Hours start at the first trip accepted, entered or started this shift.
  let start: number | null = null;
  for (const t of trips.data ?? []) {
    const events = [t.accepted_at, t.created_by === me.id ? t.created_at : null, t.started_at].filter(Boolean).map((x: string) => Date.parse(x));
    if (!events.length) continue;
    const at = Math.max(Math.min(...events), Date.parse(since));
    if (at <= Date.parse(until) && (start === null || at < start)) start = at;
  }
  const time = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : '-';
  const hm = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;
  let hours: { start: string; end: string; minutes: number } | null = null;
  let hoursError = '';
  if (start !== null) {
    const startIso = new Date(start).toISOString();
    hours = { start: startIso, end: until, minutes: Math.round((Date.parse(until) - start) / 60000) };
    const { data: existing } = await admin.from('shifts').select('id').eq('driver_id', me.id).eq('start_at', startIso).limit(1);
    if (!existing?.length && hours.minutes > 0) {
      const { error } = await admin.from('shifts').insert({
        driver_id: me.id,
        shift_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date(start)),
        start_at: startIso,
        end_at: until,
        break_minutes: 0,
        notes: `Logged automatically: first trip ${time(startIso)} to off duty ${time(until)}${breach ? ' (over 14 hours, signed out by the app)' : ''}`,
      });
      if (error) hoursError = error.message;
    }
  }
  await admin
    .from('profiles')
    .update({ on_duty: false, ...(breach ? { duty_breach_at: until } : {}) })
    .eq('id', me.id);

  const night = me.shift_type === 'night';
  const loaded = bases.data ?? [];
  const allTrips = trips.data ?? [];
  const rail = allTrips.filter((t: { kind?: string }) => t.kind === 'rail');
  const loads = allTrips.filter((t: { kind?: string }) => t.kind !== 'rail');
  const mins = Math.round((Date.parse(until) - Date.parse(since)) / 60000);
  const name = me.full_name ?? 'A driver';
  const cell = 'padding:6px 10px;border-bottom:1px solid #eee';
  const tripRows = loads
    // deno-lint-ignore no-explicit-any
    .map((t: any) => {
      const km = t.start_odometer && t.end_odometer ? `${t.end_odometer - t.start_odometer} km` : '';
      return `<tr><td style="${cell}">${escapeHtml(t.pickup)} → ${escapeHtml(t.dropoff)}<br>${escapeHtml([t.customer, t.job_ref].filter(Boolean).join(' · '))}</td>
        <td style="${cell}">${escapeHtml([t.truck_rego, t.trailer_rego].filter(Boolean).join(' / '))}</td>
        <td style="${cell}">${time(t.started_at)} - ${time(t.finished_at)}<br>${km}</td>
        <td style="${cell}">${escapeHtml(t.status === 'completed' ? 'Done' : t.status === 'in_progress' ? 'Not finished' : 'Not started')}</td></tr>`;
    })
    .join('');
  // deno-lint-ignore no-explicit-any
  const fuel = (sheets.data ?? []).filter((x: any) => x.kind === 'fuel');
  // deno-lint-ignore no-explicit-any
  const runsheets = (sheets.data ?? []).filter((x: any) => x.kind !== 'fuel');
  // deno-lint-ignore no-explicit-any
  const faults = (checks.data ?? []).flatMap((c: any) => (c.items ?? []).filter((i: { ok: boolean }) => !i.ok).map((i: { label: string; note?: string }) => `${c.truck_rego}: ${i.label}${i.note ? ` (${i.note})` : ''}`));
  const breachHtml = breach
    ? `<p style="margin:0 0 10px;padding:10px;background:#fde8e8;color:#c0262d;font-weight:700">BREACH: ${escapeHtml(name)} was on duty for ${hm(mins)}, over the 14 hour limit. The app took them off duty and signed them out. They have been asked to report the breach to the office.</p>`
    : '';
  const html = `
    ${breachHtml}
    <h2 style="margin:0 0 8px">${night ? 'Night' : 'Day'} shift report: ${escapeHtml(name)}</h2>
    <p style="margin:0 0 4px"><b>Date:</b> ${dmy(day)}</p>
    <p style="margin:0 0 4px"><b>Shift:</b> ${night ? 'Night' : 'Day'}</p>
    <p style="margin:0 0 4px"><b>On duty:</b> ${time(since)} to ${time(until)} (${Math.floor(mins / 60)} h ${mins % 60} min)</p>
    <p style="margin:0 0 4px"><b>Hours logged:</b> ${
      hours ? `${time(hours.start)} to ${time(hours.end)} (${hm(hours.minutes)}, no break; change it in the app if needed)${hoursError ? ` <b style="color:#c0262d">but saving failed: ${escapeHtml(hoursError)}</b>` : ''}` : 'none (no trip was accepted or entered this shift)'
    }</p>
    ${me.phone ? `<p style="margin:0 0 4px"><b>Phone:</b> ${escapeHtml(me.phone)}</p>` : ''}
    <h3 style="margin:12px 0 4px">Trips (${loads.length})</h3>
    ${tripRows ? `<table style="border-collapse:collapse;font-size:14px"><tr style="text-align:left;background:#15171c;color:#fff"><th style="padding:6px 10px">Trip</th><th style="padding:6px 10px">Truck</th><th style="padding:6px 10px">Time</th><th style="padding:6px 10px">Status</th></tr>${tripRows}</table>` : '<p>No trips.</p>'}
    ${rail.length ? `<p style="margin:8px 0 4px"><b>Rail bases to Pacific National:</b> ${rail.length} (listed in the runsheet email)</p>` : ''}
    ${night || loaded.length ? `<h3 style="margin:12px 0 4px">Bases loaded on night shift: ${loaded.length}</h3>${loaded.length ? `<ul style="margin:4px 0 8px;padding-left:18px">${loaded.map((b: { base_id: string; load_number?: string }) => `<li>${escapeHtml(b.base_id)} - load ${escapeHtml(b.load_number ?? '')}</li>`).join('')}</ul>` : ''}` : ''}
    <h3 style="margin:12px 0 4px">Paperwork</h3>
    <p style="margin:0 0 4px"><b>Runsheets sent:</b> ${runsheets.length}</p>
    <p style="margin:0 0 4px"><b>Fuel dockets sent:</b> ${fuel.length}${fuel.length ? ` (${fuel.reduce((a: number, f: { litres?: number }) => a + Number(f.litres ?? 0), 0)} L, $${fuel.reduce((a: number, f: { fuel_cost?: number }) => a + Number(f.fuel_cost ?? 0), 0).toFixed(2)})` : ''}</p>
    <p style="margin:0 0 4px"><b>Pre-trip checks:</b> ${checks.data?.length ?? 0}${(checks.data ?? []).some((c: { safe_to_drive: boolean }) => !c.safe_to_drive) ? ' <b style="color:#c0262d">(one marked NOT safe to drive)</b>' : ''}</p>
    ${faults.length ? `<p style="margin:0 0 4px"><b>Faults reported:</b> ${faults.map(escapeHtml).join('; ')}</p>` : ''}`;

  // The driver is told too, so they report it.
  let driverEmail: string | null = null;
  if (breach && me.email) {
    driverEmail = await sendEmail(
      me.email,
      'SBT Truckin: you went over 14 hours on duty - report it to the office',
      `<p>Hi ${escapeHtml(name.split(' ')[0])},</p>
       <p>You were on duty from ${time(since)} for ${hm(mins)}, which is over the 14 hour limit. The app has taken you off duty and signed you out.</p>
       <p><b>You need to report this breach to the office.</b> Call them as soon as you can.</p>
       <p>SBT Truckin</p>`,
    ).then(
      () => 'sent',
      (e) => `failed: ${e instanceof Error ? e.message : e}`,
    );
  }
  await sendToOffice(
    `${breach ? 'BREACH over 14h - ' : ''}${night ? 'Night' : 'Day'} report - ${name} - ${dmy(day)} - ${hm(mins)} on duty${night ? ` - ${loaded.length} bases loaded` : ''}`,
    html + (driverEmail && driverEmail !== 'sent' ? `<p style="color:#c0262d">The email to the driver (${escapeHtml(me.email)}) didn't send: ${escapeHtml(driverEmail)}. Please call them.</p>` : ''),
  );
  return { hours, breach, driverEmail };
}
