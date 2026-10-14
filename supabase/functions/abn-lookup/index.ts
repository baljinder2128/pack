// Looks up an ABN on the Australian Business Register (ABR) and returns the
// registered name and GST status, so the app can fill in RCTI details.
//
// Deploy in the Supabase dashboard as abn-lookup, with Verify JWT off (the
// caller is checked below). Needs secret ABR_GUID: the free web services key
// from https://abr.business.gov.au/Tools/WebServices
//
// Body: { abn }
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return json({ error: 'Please sign in again' }, 401);

  const guid = Deno.env.get('ABR_GUID');
  if (!guid) return json({ error: 'ABN lookup is not set up yet (ABR_GUID secret missing)' }, 500);

  const { abn } = await req.json().catch(() => ({}));
  const digits = String(abn ?? '').replace(/\D/g, '');
  if (digits.length !== 11) return json({ error: 'An ABN has 11 digits' }, 400);

  const url = `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${digits}&callback=cb&guid=${encodeURIComponent(guid)}`;
  const res = await fetch(url);
  if (!res.ok) return json({ error: `ABR lookup failed (${res.status})` }, 502);
  // The ABR answers JSONP: cb({...})
  const text = await res.text();
  const start = text.indexOf('(');
  const end = text.lastIndexOf(')');
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(text.slice(start + 1, end));
  } catch {
    return json({ error: 'Could not read the ABR response' }, 502);
  }
  if (d.Message) return json({ error: String(d.Message) }, 404);
  if (!d.Abn) return json({ error: 'ABN not found' }, 404);

  return json({
    abn: d.Abn,
    status: d.AbnStatus, // "Active" or "Cancelled"
    entityName: d.EntityName,
    entityType: d.EntityTypeName,
    businessNames: Array.isArray(d.BusinessName) ? d.BusinessName : [],
    gstRegistered: Boolean(d.Gst),
    gstFrom: d.Gst || null,
    state: d.AddressState,
    postcode: d.AddressPostcode,
  });
});
