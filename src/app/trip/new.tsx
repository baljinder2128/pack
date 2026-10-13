import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';

import { DriverPicker } from '@/components/DriverPicker';
import { RegoPicker } from '@/components/RegoPicker';
import { Button, ErrorText, Field, Muted, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listDrivers } from '@/lib/drivers';
import { numOrNull } from '@/lib/format';
import { parseDateInput, toDMY, toISODate } from '@/lib/pay';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

export default function NewTrip() {
  const { session, isOffice } = useAuth();
  const [drivers, setDrivers] = useState<Profile[]>([]);
  // Office plans loads for a driver, so they choose who; drivers log their own.
  const [driverId, setDriverId] = useState<string | null>(isOffice ? null : session?.user.id ?? null);
  const [form, setForm] = useState({
    trip_date: toDMY(toISODate(new Date())),
    truck_rego: '',
    trailer_rego: '',
    visy_trailer: '',
    customer: '',
    job_ref: '',
    pickup: '',
    dropoff: '',
    start_odometer: '',
    notes: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  useEffect(() => {
    if (isOffice) listDrivers().then((p) => setDrivers(p.filter((d) => d.role === 'driver'))).catch(() => {});
  }, [isOffice]);

  async function save() {
    const tripDate = parseDateInput(form.trip_date);
    if (!tripDate) return setError('Enter the date like 13/10/2026.');
    if (!form.truck_rego.trim() || !form.pickup.trim() || !form.dropoff.trim())
      return setError('Truck rego, pickup and drop-off are required.');
    if (!driverId) return setError('Choose a driver.');
    setBusy(true);
    const { data, error } = await supabase
      .from('trips')
      .insert({
        driver_id: driverId,
        trip_date: tripDate,
        truck_rego: form.truck_rego.trim().toUpperCase(),
        trailer_rego: form.trailer_rego.trim().toUpperCase() || null,
        ...(form.visy_trailer.trim() ? { visy_trailer: form.visy_trailer.trim().toUpperCase() } : {}),
        customer: form.customer.trim() || null,
        job_ref: form.job_ref.trim() || null,
        pickup: form.pickup.trim(),
        dropoff: form.dropoff.trim(),
        start_odometer: numOrNull(form.start_odometer),
        // Drivers are paid by the hour, so a planned load carries no trip pay.
        amount: 0,
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
      {isOffice && <Stack.Screen options={{ title: 'Plan a load' }} />}
      {isOffice && <Muted>The driver sees this load in their app straight away, under Active trips.</Muted>}
      {isOffice && <DriverPicker drivers={drivers} value={driverId} onChange={setDriverId} />}
      <Field label="Date (DD/MM/YYYY)" value={form.trip_date} onChangeText={set('trip_date')} />
      <RegoPicker kind="truck" label="Truck rego" value={form.truck_rego} onChange={set('truck_rego')} />
      <RegoPicker kind="trailer" label="Trailer rego" value={form.trailer_rego} onChange={set('trailer_rego')} />
      <Field
        label="Visy trailer number (if towing a Visy trailer)"
        value={form.visy_trailer}
        onChangeText={set('visy_trailer')}
        autoCapitalize="characters"
      />
      <Field label="Customer" value={form.customer} onChangeText={set('customer')} />
      <Field label="Job / docket number" value={form.job_ref} onChangeText={set('job_ref')} />
      <Field label="Pickup" value={form.pickup} onChangeText={set('pickup')} />
      <Field label="Drop-off" value={form.dropoff} onChangeText={set('dropoff')} />
      <Field label="Start odometer (km)" value={form.start_odometer} onChangeText={set('start_odometer')} keyboardType="number-pad" />
      <Field label="Notes" value={form.notes} onChangeText={set('notes')} multiline />
      <ErrorText>{error}</ErrorText>
      <Button title="Save trip" onPress={save} busy={busy} />
    </Screen>
  );
}
