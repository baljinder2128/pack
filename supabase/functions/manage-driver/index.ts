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
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: isOffice } = await userClient.rpc('is_office');
  if (!isOffice) return json({ error: 'Only office users can manage drivers' }, 403);

  const { data: caller } = await userClient.auth.getUser();
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
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

      // The on_auth_user_created trigger made the profile; add the extras.
      if (body.phone) {
        await admin.from('profiles').update({ phone: String(body.phone) }).eq('id', data.user.id);
      }
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
