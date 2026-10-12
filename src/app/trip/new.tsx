import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { DriverPicker } from '@/components/DriverPicker';
import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listDrivers } from '@/lib/drivers';
import { numOrNull } from '@/lib/format';
import { isISODate, toISODate } from '@/lib/pay';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

export default function NewTrip() {
  const { session, isOffice } = useAuth();
  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [driverId, setDriverId] = useState<string | null>(session?.user.id ?? null);
  const [form, setForm] = useState({
    trip_date: toISODate(new Date()),
    truck_rego: '',
    trailer_rego: '',
    customer: '',
    job_ref: '',
    pickup: '',
    dropoff: '',
    start_odometer: '',
    amount: '',
    notes: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  useEffect(() => {
    if (isOffice) listDrivers().then(setDrivers).catch(() => {});
  }, [isOffice]);

  async function save() {
    if (!isISODate(form.trip_date)) return setError('Date must be YYYY-MM-DD.');
    if (!form.truck_rego.trim() || !form.pickup.trim() || !form.dropoff.trim())
      return setError('Truck rego, pickup and drop-off are required.');
    if (!driverId) return setError('Choose a driver.');
    setBusy(true);
    const { data, error } = await supabase
      .from('trips')
      .insert({
        driver_id: driverId,
        trip_date: form.trip_date,
        truck_rego: form.truck_rego.trim().toUpperCase(),
        trailer_rego: form.trailer_rego.trim().toUpperCase() || null,
        customer: form.customer.trim() || null,
        job_ref: form.job_ref.trim() || null,
        pickup: form.pickup.trim(),
        dropoff: form.dropoff.trim(),
        start_odometer: numOrNull(form.start_odometer),
        amount: isOffice ? numOrNull(form.amount) ?? 0 : 0,
        notes: form.notes.trim() || null,
      })
      .select('id')
      .single();
    setBusy(false);
    if (error) return setError(error.message);
    router.replace(`/trip/${data.id}`);
  }

  return (
    <Screen>
      {isOffice && <DriverPicker drivers={drivers} value={driverId} onChange={setDriverId} />}
      <Field label="Date (YYYY-MM-DD)" value={form.trip_date} onChangeText={set('trip_date')} />
      <Field label="Truck rego" value={form.truck_rego} onChangeText={set('truck_rego')} autoCapitalize="characters" />
      <Field label="Trailer rego" value={form.trailer_rego} onChangeText={set('trailer_rego')} autoCapitalize="characters" />
      <Field label="Customer" value={form.customer} onChangeText={set('customer')} />
      <Field label="Job / docket number" value={form.job_ref} onChangeText={set('job_ref')} />
      <Field label="Pickup" value={form.pickup} onChangeText={set('pickup')} />
      <Field label="Drop-off" value={form.dropoff} onChangeText={set('dropoff')} />
      <Field label="Start odometer (km)" value={form.start_odometer} onChangeText={set('start_odometer')} keyboardType="number-pad" />
      {isOffice && <Field label="Trip pay ($, ex GST)" value={form.amount} onChangeText={set('amount')} keyboardType="decimal-pad" />}
      <Field label="Notes" value={form.notes} onChangeText={set('notes')} multiline />
      <ErrorText>{error}</ErrorText>
      <Button title="Save trip" onPress={save} busy={busy} />
    </Screen>
  );
}
