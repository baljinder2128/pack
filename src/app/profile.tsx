import { router } from 'expo-router';
import { useState } from 'react';

import { Button, ErrorText, Field, Muted, Screen, Toggle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { stopTracking } from '@/lib/tracking';

// A driver's own contact and business details. These appear on their RCTI.
export default function ProfileScreen() {
  const { profile, refreshProfile } = useAuth();
  const [form, setForm] = useState({
    full_name: profile?.full_name ?? '',
    phone: profile?.phone ?? '',
    business_name: profile?.business_name ?? '',
    abn: profile?.abn ?? '',
    address: profile?.address ?? '',
  });
  const [gst, setGst] = useState(profile?.gst_registered ?? true);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  async function save() {
    if (!profile) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('profiles')
      .update({ ...form, gst_registered: gst })
      .eq('id', profile.id);
    if (!error && password) {
      if (password.length < 8) {
        setBusy(false);
        return setError('New password must be at least 8 characters.');
      }
      const res = await supabase.auth.updateUser({ password });
      if (res.error) {
        setBusy(false);
        return setError(res.error.message);
      }
    }
    setBusy(false);
    if (error) return setError(error.message);
    await refreshProfile();
    router.back();
  }

  async function withdrawConsent() {
    if (!profile) return;
    await stopTracking();
    await supabase.from('profiles').update({ tracking_consent_at: null, on_duty: false }).eq('id', profile.id);
    await refreshProfile();
  }

  return (
    <Screen>
      <Field label="Full name" value={form.full_name} onChangeText={set('full_name')} />
      <Field label="Phone" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      <Muted>Your business details are printed on your weekly RCTI.</Muted>
      <Field label="Business name" value={form.business_name} onChangeText={set('business_name')} />
      <Field label="ABN" value={form.abn} onChangeText={set('abn')} keyboardType="number-pad" />
      <Field label="Address" value={form.address} onChangeText={set('address')} multiline />
      <Toggle label="Registered for GST" value={gst} onChange={setGst} />
      <Field label="New password (leave blank to keep)" value={password} onChangeText={setPassword} secureTextEntry />
      <ErrorText>{error}</ErrorText>
      <Button title="Save" onPress={save} busy={busy} />
      {profile?.tracking_consent_at && (
        <>
          <Muted>You agreed to on-duty location tracking. Withdrawing stops tracking; you'll be asked again next time you go on duty.</Muted>
          <Button title="Withdraw tracking consent" variant="secondary" onPress={withdrawConsent} />
        </>
      )}
    </Screen>
  );
}
