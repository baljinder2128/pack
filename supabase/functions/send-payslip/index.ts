// Emails an issued payslip (PDF made by the app) to the employee, with a
// copy to the office.
//
// Deploy in the Supabase dashboard (Edge Functions > Deploy a new function),
// name it send-payslip and turn Verify JWT off: the caller is checked below.
// Sends from Gmail when the GMAIL_USER and GMAIL_APP_PASSWORD secrets are set
// (an app password from myaccount.google.com/apppasswords, not the normal
// Gmail password). Otherwise uses Resend (RESEND_API_KEY), which only reaches
// the office until a domain is verified there.
// Optional secret: RCTI_EMAIL (office copy, default sbtruckin@outlook.com).
//
// Body: { payslip_id, pdf_base64 }
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
  if (me?.role !== 'office') return json({ error: 'Only office users can send payslips' }, 403);

  const { payslip_id, pdf_base64 } = await req.json().catch(() => ({}));
  if (!payslip_id || !pdf_base64) return json({ error: 'payslip_id and pdf_base64 are required' }, 400);

  const { data: slip, error } = await admin
    .from('payslips')
    .select('*, employee:profiles!payslips_employee_id_fkey(full_name, email)')
    .eq('id', payslip_id)
    .single();
  if (error || !slip) return json({ error: error?.message ?? 'Payslip not found' }, 404);

  const office = Deno.env.get('RCTI_EMAIL') ?? 'sbtruckin@outlook.com';
  const from = Deno.env.get('EMAIL_FROM') ?? 'SBT Truckin <onboarding@resend.dev>';
  const name = slip.employee?.full_name ?? 'Employee';
  const to = slip.employee?.email ? [slip.employee.email] : [office];
  const period = `${dmy(slip.week_start)} to ${dmy(slip.week_end)}`;

  const html = `
    <p>Hi ${escapeHtml(name.split(' ')[0])},</p>
    <p>Your payslip for the week ${period} is attached.</p>
    <p style="margin:0 0 4px"><b>Gross pay:</b> ${money(slip.gross)}</p>
    <p style="margin:0 0 4px"><b>Tax withheld:</b> ${money(Number(slip.tax) + Number(slip.stsl))}</p>
    <p style="margin:0 0 4px;font-size:16px"><b>Net pay:</b> ${money(slip.net)} (paid ${dmy(slip.pay_date)})</p>
    <p style="margin:0 0 4px"><b>Super:</b> ${money(slip.super)}</p>
    <p>SBT Truckin</p>`;

  const subject = `Payslip #${slip.number} - ${name} - week ${period}`;
  const filename = `Payslip-${slip.number}-${name.replace(/[^A-Za-z0-9]+/g, '-')}.pdf`;
  const cc = to[0] === office ? undefined : [office];

  const gmailUser = Deno.env.get('GMAIL_USER');
  const gmailPass = Deno.env.get('GMAIL_APP_PASSWORD');
  if (gmailUser && gmailPass) {
    // Port 465 (SSL): Supabase blocks outgoing 25 and 587.
    const mailer = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPass.replace(/\s/g, '') },
    });
    try {
      await mailer.sendMail({
        from: `SBT Truckin <${gmailUser}>`,
        replyTo: office,
        to,
        cc,
        subject,
        html,
        attachments: [{ filename, content: pdf_base64, encoding: 'base64', contentType: 'application/pdf' }],
      });
      return json({ ok: true, to: to[0] });
    } catch (e) {
      return json({ error: `Gmail could not send it: ${e instanceof Error ? e.message : e}` }, 502);
    }
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) return json({ error: 'Email is not configured on the server' }, 500);
  const send = (recipients: string[], cc?: string[]) =>
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: recipients,
        cc,
        subject,
        html,
        attachments: [{ filename, content: pdf_base64 }],
      }),
    });

  const res = await send(to, cc);
  if (res.ok) return json({ ok: true, to: to[0] });
  const reason = (await res.text()).slice(0, 300);
  // Until a domain is verified in Resend, it only delivers to the account's
  // own address. Fall back to the office so the payslip still arrives.
  if (to[0] !== office) {
    const retry = await send([office]);
    if (retry.ok) return json({ ok: true, to: office, employee_error: reason });
  }
  return json({ error: `Email failed to send: ${reason}` }, 502);
});
