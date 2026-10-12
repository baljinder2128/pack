import { useState } from 'react';

import { Button, ErrorText, Field, Loading, Muted, Screen } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import type { Company } from '@/lib/types';
import { unwrap, useFocusQuery } from '@/lib/useQuery';

// The business issuing the RCTIs (the "recipient" on each one).
export default function CompanyScreen() {
  const [form, setForm] = useState({ name: '', abn: '', address: '', email: '', rcti_agreement: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  const { loading, data } = useFocusQuery(async () => {
    const c = unwrap(await supabase.from('company').select('*').eq('id', 1).single()) as Company;
    setForm({ name: c.name, abn: c.abn, address: c.address, email: c.email, rcti_agreement: c.rcti_agreement });
    return c;
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('company').update(form).eq('id', 1);
    setBusy(false);
    if (error) setError(error.message);
    else setMsg('Saved.');
  }

  if (loading && !data) return <Loading />;
  return (
    <Screen>
      <Field label="Business name" value={form.name} onChangeText={set('name')} />
      <Field label="ABN" value={form.abn} onChangeText={set('abn')} keyboardType="number-pad" />
      <Field label="Address" value={form.address} onChangeText={set('address')} multiline />
      <Field label="Email" value={form.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" />
      <Field label="RCTI agreement wording" value={form.rcti_agreement} onChangeText={set('rcti_agreement')} multiline />
      <Muted>The agreement wording is printed on every RCTI.</Muted>
      <ErrorText>{error}</ErrorText>
      {msg && <Muted>{msg}</Muted>}
      <Button title="Save" onPress={save} busy={busy} />
    </Screen>
  );
}
