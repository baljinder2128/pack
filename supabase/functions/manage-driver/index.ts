// Lets office users create, remove, restore and reset driver logins.
// Creating auth users needs the service role key, so this runs on the server.
//
// Deploy:  supabase functions deploy manage-driver
//
// Body (one of):
//   { action: 'create', email, password, full_name, phone?, role? }
//   { action: 'remove', user_id }          -> blocks the login, keeps their history
//   { action: 'restore', user_id }         -> lets a removed driver sign in again
//   { action: 'reset_password', user_id, password }
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// About 100 years: Supabase has no permanent ban, so this is effectively one.
const BANNED = '876000h';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) return json({ error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY' }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Work out who is calling from their sign-in token. This works with both
  // the legacy and the new (publishable/secret) Supabase API keys.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return json({ error: 'Please sign in again' }, 401);
  const { data: me } = await admin.from('profiles').select('role, active').eq('id', auth.user.id).maybeSingle();
  if (me?.role !== 'office' || !me.active) return json({ error: 'Only office users can manage drivers' }, 403);

  const caller = { user: auth.user };
  const body = await req.json().catch(() => ({}));

  switch (body.action) {
    case 'create': {
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      const fullName = String(body.full_name ?? '').trim();
      if (!email || !fullName) return json({ error: 'Name and email are required' }, 400);
      if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400);
      const role = body.role === 'office' ? 'office' : 'driver';

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
        app_metadata: { role },
      });
      if (error) return json({ error: error.message }, 400);

      // The on_auth_user_created trigger normally makes the profile; upsert so
      // the driver still shows up if that trigger is missing.
      const { error: profileError } = await admin.from('profiles').upsert({
        id: data.user.id,
        full_name: fullName,
        email,
        role,
        phone: body.phone ? String(body.phone) : null,
      });
      if (profileError) return json({ error: `Login made, but saving the profile failed: ${profileError.message}` }, 500);
      return json({ ok: true, user_id: data.user.id });
    }

    case 'remove': {
      const userId = String(body.user_id ?? '');
      if (userId === caller.user?.id) return json({ error: "You can't remove your own login" }, 400);
      const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: BANNED });
      if (error) return json({ error: error.message }, 400);
      await admin.from('profiles').update({ active: false, on_duty: false }).eq('id', userId);
      // A banned user's refresh token stops working, so they are signed out
      // of every device within the hour (when their access token expires).
      return json({ ok: true });
    }

    case 'restore': {
      const userId = String(body.user_id ?? '');
      const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' });
      if (error) return json({ error: error.message }, 400);
      await admin.from('profiles').update({ active: true }).eq('id', userId);
      return json({ ok: true });
    }

    case 'reset_password': {
      const password = String(body.password ?? '');
      if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400);
      const { error } = await admin.auth.admin.updateUserById(String(body.user_id ?? ''), { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    default:
      return json({ error: 'Unknown action' }, 400);
  }
});
