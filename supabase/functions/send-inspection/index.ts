// Emails a submitted pre-trip inspection (with photos attached) to the office.
//
// Deploy:   supabase functions deploy send-inspection
// Secrets:  supabase secrets set RESEND_API_KEY=... INSPECTION_EMAIL=sbtruckin@outlook.com EMAIL_FROM="SBT Truckin <inspections@yourdomain.com>"
//
// Called by the app right after an inspection row is inserted:
//   supabase.functions.invoke('send-inspection', { body: { inspection_id } })
import { createClient } from 'npm:@supabase/supabase-js@2';

type Item = { key: string; label: string; ok: boolean; note?: string; section?: 'truck' | 'trailer' };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// The office address is set on the Company details screen (0013 SQL); before that
// it falls back to the INSPECTION_EMAIL secret, then sbtruckin@outlook.com.
// deno-lint-ignore no-explicit-any
async function officeEmail(admin: any): Promise<string> {
  const { data } = await admin.from('company').select('office_email').eq('id', 1).maybeSingle();
  return (data as { office_email?: string } | null)?.office_email?.trim() || Deno.env.get('INSPECTION_EMAIL') || 'sbtruckin@outlook.com';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM') ?? 'SBT Truckin <onboarding@resend.dev>';

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const to = await officeEmail(admin);

  // Check the caller is signed in, and is the driver who made it or office.
  // Works with both the legacy and the new Supabase API keys.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return json({ error: 'Please sign in again' }, 401);

  const { inspection_id } = await req.json().catch(() => ({}));
  if (!inspection_id) return json({ error: 'inspection_id is required' }, 400);

  const { data: insp, error } = await admin
    .from('inspections')
    .select('*, driver:profiles!inspections_driver_id_fkey(full_name, phone)')
    .eq('id', inspection_id)
    .single();
  if (error || !insp) return json({ error: error?.message ?? 'Inspection not found' }, 404);
  if (insp.driver_id !== auth.user.id) {
    const { data: me } = await admin.from('profiles').select('role').eq('id', auth.user.id).maybeSingle();
    if (me?.role !== 'office') return json({ error: 'Inspection not found' }, 404);
  }

  if (!resendKey) {
    await admin.from('inspections').update({ email_error: 'RESEND_API_KEY not set' }).eq('id', inspection_id);
    return json({ error: 'Email is not configured on the server' }, 500);
  }

  // Resend downloads each attachment from a short-lived signed URL.
  const attachments: { filename: string; path: string }[] = [];
  for (const [i, path] of (insp.photo_paths as string[]).entries()) {
    const { data } = await admin.storage.from('inspection-photos').createSignedUrl(path, 60 * 60);
    if (data?.signedUrl) attachments.push({ filename: `photo-${i + 1}.jpg`, path: data.signedUrl });
  }

  const items = (insp.items as Item[]) ?? [];
  const defects = items.filter((it) => !it.ok);
  const driverName = insp.driver?.full_name || 'Driver';
  const when = new Date(insp.created_at).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });

  const rows = items
    .map(
      (it, i) =>
        (it.section !== items[i - 1]?.section
          ? `<tr><td colspan="3" style="padding:8px 8px 4px;font-weight:700;background:#f3f4f6">${it.section === 'trailer' ? 'Trailer' : 'Truck'}</td></tr>`
          : '') +
        `<tr><td style="padding:4px 8px">${escapeHtml(it.label)}</td>` +
        `<td style="padding:4px 8px;color:${it.ok ? '#15803d' : '#b91c1c'};font-weight:600">${it.ok ? 'OK' : 'FAULT'}</td>` +
        `<td style="padding:4px 8px">${escapeHtml(it.note)}</td></tr>`,
    )
    .join('');

  const html = `
    <h2 style="margin:0 0 8px">Pre-trip inspection: ${escapeHtml(insp.truck_rego)}</h2>
    <p style="margin:0 0 4px"><b>Driver:</b> ${escapeHtml(driverName)} ${escapeHtml(insp.driver?.phone ?? '')}</p>
    <p style="margin:0 0 4px"><b>When:</b> ${escapeHtml(when)}</p>
    <p style="margin:0 0 4px"><b>Trailer:</b> ${escapeHtml(insp.trailer_rego || '-')}${insp.visy_trailer ? ` &nbsp; <b>Visy trailer:</b> ${escapeHtml(insp.visy_trailer)}` : ''} &nbsp; <b>Odometer:</b> ${escapeHtml(insp.odometer ?? '-')}</p>
    <p style="margin:8px 0;font-size:16px;font-weight:700;color:${insp.safe_to_drive ? '#15803d' : '#b91c1c'}">
      ${insp.safe_to_drive ? 'Safe to drive' : 'NOT SAFE TO DRIVE'} &middot; ${defects.length} fault(s)
    </p>
    <table style="border-collapse:collapse;border:1px solid #ddd">${rows}</table>
    ${insp.notes ? `<p><b>Notes:</b> ${escapeHtml(insp.notes)}</p>` : ''}
    <p>${attachments.length} photo(s) attached.</p>`;

  const subject =
    `${insp.safe_to_drive ? '' : 'NOT SAFE: '}Pre-trip ${insp.truck_rego} - ${driverName}` +
    (defects.length ? ` (${defects.length} fault${defects.length > 1 ? 's' : ''})` : '');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html, attachments }),
  });

  if (!res.ok) {
    const message = await res.text();
    await admin.from('inspections').update({ email_error: message.slice(0, 500) }).eq('id', inspection_id);
    return json({ error: `Email failed to send: ${message.slice(0, 300)}` }, 502);
  }

  await admin
    .from('inspections')
    .update({ emailed_at: new Date().toISOString(), email_error: null })
    .eq('id', inspection_id);
  return json({ ok: true });
});
