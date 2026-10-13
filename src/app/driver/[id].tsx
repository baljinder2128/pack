import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, Card, ErrorText, Field, Loading, Muted, Screen, Segmented, Select, Title, Toggle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { callFunction } from '@/lib/drivers';
import { numOrNull } from '@/lib/format';
import { LICENCE_CLASSES, STATES } from '@/lib/licence';
import { isISODate } from '@/lib/pay';
import { supabase } from '@/lib/supabase';
import type { Profile, Role } from '@/lib/types';
import { unwrap, useFocusQuery } from '@/lib/useQuery';
import { alert } from '@/lib/alert';

// Office view of one person: pay rate, RCTI details, and removing their login.
export default function DriverScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    business_name: '',
    abn: '',
    address: '',
    hourly_rate: '',
    licence_number: '',
    licence_class: '',
    licence_state: '',
    licence_expiry: '',
    start_date: '',
  });
  const [gst, setGst] = useState(true);
  const [role, setRole] = useState<Role>('driver');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  const { data: driver, loading, reload } = useFocusQuery(async () => {
    const d = unwrap(await supabase.from('profiles').select('*').eq('id', id).single()) as Profile;
    setForm({
      full_name: d.full_name,
      phone: d.phone ?? '',
      business_name: d.business_name ?? '',
      abn: d.abn ?? '',
      address: d.address ?? '',
      hourly_rate: d.hourly_rate ? String(d.hourly_rate) : '',
      licence_number: d.licence_number ?? '',
      licence_class: d.licence_class ?? '',
      licence_state: d.licence_state ?? '',
      licence_expiry: d.licence_expiry ?? '',
      start_date: d.start_date ?? '',
    });
    setGst(d.gst_registered);
    setRole(d.role);
    return d;
  }, [id]);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await fn();
      setMsg(done);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(async () => {
      for (const [key, label] of [
        ['licence_expiry', 'Licence expiry'],
        ['start_date', 'Start date'],
      ] as const) {
        if (form[key] && !isISODate(form[key])) throw new Error(`${label} must be YYYY-MM-DD.`);
      }
      const { error } = await supabase
        .from('profiles')
        .update({
          ...form,
          hourly_rate: numOrNull(form.hourly_rate) ?? 0,
          licence_class: form.licence_class.trim().toUpperCase() || null,
          licence_state: form.licence_state.trim().toUpperCase() || null,
          licence_expiry: form.licence_expiry || null,
          start_date: form.start_date || null,
          gst_registered: gst,
          role,
        })
        .eq('id', id);
      if (error) throw new Error(error.message);
    }, 'Saved.');

  function remove() {
    alert(
      `Remove ${driver?.full_name}?`,
      'They will be signed out and can no longer log in. Their trips, hours and RCTIs are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => run(() => callFunction('manage-driver', { action: 'remove', user_id: id }), 'Login removed.'),
        },
      ],
    );
  }

  if (loading && !driver) return <Loading />;
  if (!driver) return <ErrorText>Not found</ErrorText>;
  const isSelf = driver.id === session?.user.id;

  return (
    <Screen>
      <Card>
        <Title>{driver.full_name}</Title>
        <Muted>{driver.email}</Muted>
        {!driver.active && <Muted>This login has been removed.</Muted>}
        <Muted>
          {driver.tracking_consent_at
            ? `Agreed to on-duty tracking ${new Date(driver.tracking_consent_at).toLocaleDateString('en-AU')}`
            : 'Has not agreed to location tracking yet'}
          {driver.on_duty ? ' · On duty now' : ''}
        </Muted>
      </Card>
      {!isSelf && (
        <Segmented
          value={role}
          onChange={setRole}
          options={[
            { value: 'driver', label: 'Driver' },
            { value: 'office', label: 'Office' },
          ]}
        />
      )}
      <Field label="Full name" value={form.full_name} onChangeText={set('full_name')} />
      <Field label="Phone" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      <Field label="Hourly rate ($, inc GST)" value={form.hourly_rate} onChangeText={set('hourly_rate')} keyboardType="decimal-pad" />
      <Muted>A new rate is used for RCTIs issued from now on. RCTIs already issued keep their amounts.</Muted>
      <Field label="Start date (YYYY-MM-DD)" value={form.start_date} onChangeText={set('start_date')} />
      <Title>Licence</Title>
      <Field label="Licence number" value={form.licence_number} onChangeText={set('licence_number')} autoCapitalize="characters" />
      <Select label="Licence class" value={form.licence_class} options={LICENCE_CLASSES} onChange={set('licence_class')} />
      <Select label="State" value={form.licence_state} options={STATES} onChange={set('licence_state')} />
      <Field label="Expiry (YYYY-MM-DD)" value={form.licence_expiry} onChangeText={set('licence_expiry')} />
      <Title>Business (for RCTI)</Title>
      <Field label="Business name" value={form.business_name} onChangeText={set('business_name')} />
      <Field label="ABN" value={form.abn} onChangeText={set('abn')} keyboardType="number-pad" />
      <Field label="Address" value={form.address} onChangeText={set('address')} multiline />
      <Toggle label="Registered for GST" value={gst} onChange={setGst} />
      <Button title="Save" onPress={save} busy={busy} />

      <Card>
        <Title>Reset password</Title>
        <Field label="New password" value={newPassword} onChangeText={setNewPassword} autoCapitalize="none" />
        <Button
          title="Set password"
          variant="secondary"
          busy={busy}
          onPress={() =>
            run(
              () => callFunction('manage-driver', { action: 'reset_password', user_id: id, password: newPassword }),
              `Password changed to: ${newPassword}`,
            )
          }
        />
      </Card>

      <ErrorText>{error}</ErrorText>
      {msg && <Muted>{msg}</Muted>}

      {!isSelf &&
        (driver.active ? (
          <Button title="Remove from system" variant="danger" onPress={remove} busy={busy} />
        ) : (
          <Button
            title="Restore login"
            variant="success"
            busy={busy}
            onPress={() => run(() => callFunction('manage-driver', { action: 'restore', user_id: id }), 'Login restored.')}
          />
        ))}
      <Button title="Back to drivers" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
