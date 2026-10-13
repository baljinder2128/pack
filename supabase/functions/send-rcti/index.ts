// Emails an issued RCTI (PDF made by the app) to the office.
//
// Deploy in the Supabase dashboard (Edge Functions > Deploy a new function),
// name it send-rcti and turn Verify JWT off: the caller is checked below.
// Uses the same RESEND_API_KEY secret as send-inspection.
// Optional secrets: RCTI_EMAIL (default sbtruckin@outlook.com), EMAIL_FROM.
//
// Body: { rcti_id, pdf_base64 }
import { createClient } from 'npm:@supabase/supabase-js@2';

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

const money = (n: number) => `$${Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dmy = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return json({ error: 'Please sign in again' }, 401);
  const { data: me } = await admin.from('profiles').select('role').eq('id', auth.user.id).maybeSingle();
  if (me?.role !== 'office') return json({ error: 'Only office users can send RCTIs' }, 403);

  const { rcti_id, pdf_base64 } = await req.json().catch(() => ({}));
  if (!rcti_id || !pdf_base64) return json({ error: 'rcti_id and pdf_base64 are required' }, 400);

  const { data: rcti, error } = await admin
    .from('rctis')
    .select('*, driver:profiles!rctis_driver_id_fkey(full_name)')
    .eq('id', rcti_id)
    .single();
  if (error || !rcti) return json({ error: error?.message ?? 'RCTI not found' }, 404);

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) return json({ error: 'Email is not configured on the server' }, 500);
  const to = Deno.env.get('RCTI_EMAIL') ?? 'sbtruckin@outlook.com';
  const from = Deno.env.get('EMAIL_FROM') ?? 'SBT Truckin <onboarding@resend.dev>';
  const driver = rcti.driver?.full_name ?? 'Driver';
  const period = `${dmy(rcti.week_start)} to ${dmy(rcti.week_end)}`;

  const html = `
    <h2 style="margin:0 0 8px">RCTI #${rcti.number}: ${escapeHtml(driver)}</h2>
    <p style="margin:0 0 4px"><b>Week:</b> ${period}</p>
    <p style="margin:0 0 4px"><b>Subtotal (ex GST):</b> ${money(rcti.subtotal)}</p>
    <p style="margin:0 0 4px"><b>GST:</b> ${money(rcti.gst)}</p>
    <p style="margin:0 0 4px;font-size:16px"><b>Total payable:</b> ${money(rcti.total)}</p>
    <p>The RCTI is attached as a PDF.</p>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `RCTI #${rcti.number} - ${driver} - week ${period}`,
      html,
      attachments: [{ filename: `RCTI-${rcti.number}-${driver.replace(/[^A-Za-z0-9]+/g, '-')}.pdf`, content: pdf_base64 }],
    }),
  });
  if (!res.ok) return json({ error: `Email failed to send: ${(await res.text()).slice(0, 300)}` }, 502);
  return json({ ok: true });
});
