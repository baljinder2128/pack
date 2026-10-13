import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AbnLookup } from '@/components/AbnLookup';
import { formatAbn } from '@/lib/abn';
import { Button, Card, ErrorText, Field, Loading, Muted, Screen, Segmented, Select, Title, Toggle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { callFunction } from '@/lib/drivers';
import { numOrNull } from '@/lib/format';
import { LICENCE_CLASSES, STATES } from '@/lib/licence';
import { parseDateInput, toDMY } from '@/lib/pay';
import { cleanTfn, formatTfn, isValidTfn } from '@/lib/tfn';
import { EMPLOYMENT_TYPES, TAX_SCALES, type EmploymentType, type TaxScale } from '@/lib/payroll';
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
    super_fund: '',
    super_member_no: '',
    tfn: '',
  });
  const [gst, setGst] = useState(true);
  const [payType, setPayType] = useState<'abn' | 'tfn'>('abn');
  const [employment, setEmployment] = useState<EmploymentType>('casual');
  const [taxScale, setTaxScale] = useState<TaxScale>('tft');
  const [studyLoan, setStudyLoan] = useState(false);
  const [role, setRole] = useState<Role>('driver');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  const { data: driver, loading, reload } = useFocusQuery(async () => {
    const d = unwrap(await supabase.from('profiles').select('*').eq('id', id).single()) as Profile;
    // Kept in its own office-only table. Missing before migration 0006 is run.
    const { data: tfnRow } = await supabase.from('employee_tfns').select('tfn').eq('employee_id', id).maybeSingle();
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
      licence_expiry: toDMY(d.licence_expiry),
      start_date: toDMY(d.start_date),
      super_fund: d.super_fund ?? '',
      super_member_no: d.super_member_no ?? '',
      tfn: tfnRow?.tfn ? formatTfn(tfnRow.tfn) : '',
    });
    setGst(d.gst_registered);
    setPayType(d.pay_type ?? 'abn');
    setEmployment(d.employment_type ?? 'casual');
    setTaxScale(d.tax_scale ?? 'tft');
    setStudyLoan(!!d.has_study_loan);
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
      const dates = { licence_expiry: null as string | null, start_date: null as string | null };
      for (const [key, label] of [
        ['licence_expiry', 'Licence expiry'],
        ['start_date', 'Start date'],
      ] as const) {
        if (!form[key].trim()) continue;
        dates[key] = parseDateInput(form[key]);
        if (!dates[key]) throw new Error(`${label}: enter the date like 25/12/2027.`);
      }
      const { tfn, ...details } = form;
      if (payType === 'tfn' && tfn.trim() && !isValidTfn(tfn)) throw new Error('That TFN is not valid. Check the 9 digits on their TFN declaration.');
      const { error } = await supabase
        .from('profiles')
        .update({
          ...details,
          hourly_rate: numOrNull(form.hourly_rate) ?? 0,
          licence_class: form.licence_class.trim().toUpperCase() || null,
          licence_state: form.licence_state.trim().toUpperCase() || null,
          ...dates,
          gst_registered: gst,
          pay_type: payType,
          employment_type: employment,
          tax_scale: taxScale,
          has_study_loan: studyLoan,
          super_fund: form.super_fund.trim() || null,
          super_member_no: form.super_member_no.trim() || null,
          role,
        })
        .eq('id', id);
      if (error) throw new Error(error.message);
      if (payType !== 'tfn') return;
      const { error: tfnError } = tfn.trim()
        ? await supabase.from('employee_tfns').upsert({ employee_id: id, tfn: cleanTfn(tfn), updated_at: new Date().toISOString() })
        : await supabase.from('employee_tfns').delete().eq('employee_id', id);
      if (tfnError) throw new Error(`Details saved, but the TFN wasn't: ${tfnError.message}`);
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
      <Title>How they are paid</Title>
      <Segmented
        value={payType}
        onChange={setPayType}
        options={[
          { value: 'abn', label: 'ABN (RCTI)' },
          { value: 'tfn', label: 'TFN (payslip)' },
        ]}
      />
      <Field
        label={payType === 'tfn' ? 'Hourly rate ($, gross before tax)' : 'Hourly rate ($, inc GST)'}
        value={form.hourly_rate}
        onChangeText={set('hourly_rate')}
        keyboardType="decimal-pad"
      />
      <Muted>
        A new rate is used for {payType === 'tfn' ? 'payslips' : 'RCTIs'} issued from now on. Ones already issued keep their amounts.
      </Muted>
      {payType === 'tfn' && (
        <>
          <Select
            label="Employment type"
            value={employment}
            options={EMPLOYMENT_TYPES}
            onChange={(v) => v && setEmployment(v as EmploymentType)}
          />
          <Field
            label="Tax file number (TFN)"
            value={form.tfn}
            onChangeText={set('tfn')}
            keyboardType="number-pad"
            placeholder="e.g. 123 456 782"
          />
          <Select
            label="Tax (from their TFN declaration)"
            value={taxScale}
            options={TAX_SCALES}
            onChange={(v) => v && setTaxScale(v as TaxScale)}
          />
          <Toggle label="Has a study loan (HELP, VSL, SFSS)" value={studyLoan} onChange={setStudyLoan} />
          <Field label="Super fund" value={form.super_fund} onChangeText={set('super_fund')} placeholder="e.g. AustralianSuper" />
          <Field label="Super member number" value={form.super_member_no} onChangeText={set('super_member_no')} />
          <Muted>
            Super is 12% on top of their pay. Only office can see the TFN; it isn't shown to the driver or printed on payslips.
          </Muted>
        </>
      )}
      <Field label="Start date (DD/MM/YYYY)" value={form.start_date} onChangeText={set('start_date')} placeholder="e.g. 01/07/2025" />
      <Title>Licence</Title>
      <Field label="Licence number" value={form.licence_number} onChangeText={set('licence_number')} autoCapitalize="characters" />
      <Select label="Licence class" value={form.licence_class} options={LICENCE_CLASSES} onChange={set('licence_class')} />
      <Select label="State" value={form.licence_state} options={STATES} onChange={set('licence_state')} />
      <Field label="Licence expiry (DD/MM/YYYY)" value={form.licence_expiry} onChangeText={set('licence_expiry')} placeholder="e.g. 25/12/2027" />
      {payType === 'abn' && (
        <>
          <Title>Business (for RCTI)</Title>
          <Field label="Business name" value={form.business_name} onChangeText={set('business_name')} />
          <Field label="ABN" value={form.abn} onChangeText={set('abn')} keyboardType="number-pad" />
          <AbnLookup
            abn={form.abn}
            onResult={(r) => {
              setForm((f) => ({ ...f, abn: formatAbn(r.abn), business_name: r.entityName }));
              setGst(r.gstRegistered);
            }}
          />
        </>
      )}
      <Field label="Address" value={form.address} onChangeText={set('address')} multiline />
      {payType === 'abn' && <Toggle label="Registered for GST" value={gst} onChange={setGst} />}
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
