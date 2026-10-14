import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { cleanBaseId, isBaseId } from '@/components/BaseLog';
import { DriverPicker } from '@/components/DriverPicker';
import { CustomerPicker, PlacePicker } from '@/components/PlacePicker';
import { RegoPicker } from '@/components/RegoPicker';
import { Button, ErrorText, Field, Muted, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listDrivers } from '@/lib/drivers';
import { numOrNull } from '@/lib/format';
import { parseDateInput, toDMY, toISODate } from '@/lib/pay';
import { supabase } from '@/lib/supabase';
import type { Profile, Trip } from '@/lib/types';

export default function NewTrip() {
  // With ?id= the office is changing a planned load.
  // With ?kind=rail a driver logs a rail base taken to Pacific National.
  const { id: editId, kind } = useLocalSearchParams<{ id?: string; kind?: string }>();
  const rail = kind === 'rail';
  const { session, isOffice, profile } = useAuth();
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
    base_id: '',
  });
  const [origDriver, setOrigDriver] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  useEffect(() => {
    if (!editId) return;
    supabase
      .from('trips')
      .select('*')
      .eq('id', editId)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const t = data as Trip;
        setDriverId(t.driver_id);
        setOrigDriver(t.driver_id);
        setForm({
          trip_date: toDMY(t.trip_date),
          truck_rego: t.truck_rego ?? '',
          trailer_rego: t.trailer_rego ?? '',
          visy_trailer: t.visy_trailer ?? '',
          customer: t.customer ?? '',
          job_ref: t.job_ref ?? '',
          pickup: t.pickup ?? '',
          dropoff: t.dropoff ?? '',
          start_odometer: t.start_odometer ? String(t.start_odometer) : '',
          notes: t.notes ?? '',
          base_id: t.base_id ?? '',
        });
      });
  }, [editId]);

  useEffect(() => {
    if (isOffice) listDrivers().then((p) => setDrivers(p.filter((d) => d.role === 'driver'))).catch(() => {});
  }, [isOffice]);

  async function save() {
    const tripDate = parseDateInput(form.trip_date);
    if (!tripDate) return setError('Enter the date like 13/10/2026.');
    // Hours run from the first trip of the shift, so drivers go on duty first.
    if (!isOffice && !editId && !profile?.on_duty) return setError('Go on duty first (Trips screen), then add the trip.');
    if (rail) return saveRail(tripDate);
    if (!form.truck_rego.trim() || !form.pickup.trim() || !form.dropoff.trim())
      return setError('Truck rego, pickup and drop-off are required.');
    if (!driverId) return setError('Choose a driver.');
    setBusy(true);
    const row = {
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
    };
    if (editId) {
      // Given to a different driver, the load needs accepting again.
      const patch = driverId !== origDriver ? { ...row, accepted_at: null } : row;
      const { error } = await supabase.from('trips').update(patch).eq('id', editId);
      setBusy(false);
      if (error) return setError(error.message);
      return router.back();
    }
    const { data, error } = await supabase.from('trips').insert(row).select('id').single();
    setBusy(false);
    if (error) return setError(error.message);
    router.replace(`/trip/${data.id}`);
  }

  async function saveRail(tripDate: string) {
    const baseId = cleanBaseId(form.base_id);
    if (!isBaseId(baseId)) return setError('Base ID must be IFRU followed by 7 digits, like IFRU1234567.');
    if (!form.job_ref.trim()) return setError('Enter the docket number.');
    if (!form.truck_rego.trim()) return setError('Enter the truck rego.');
    if (!driverId) return setError('Sign in again.');
    setBusy(true);
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('trips')
      .insert({
        driver_id: driverId,
        kind: 'rail',
        base_id: baseId,
        job_ref: form.job_ref.trim(),
        trip_date: tripDate,
        truck_rego: form.truck_rego.trim().toUpperCase(),
        trailer_rego: form.trailer_rego.trim().toUpperCase() || null,
        customer: 'Pacific National',
        pickup: form.pickup.trim() || 'Rail base',
        dropoff: 'Pacific National',
        amount: 0,
        notes: form.notes.trim() || null,
        // A rail lodgement is logged once it's done.
        status: 'completed',
        started_at: now,
        finished_at: now,
      })
      .select('id')
      .single();
    setBusy(false);
    if (error)
      return setError(/kind|base_id|schema cache/i.test(error.message) ? `${error.message}. The office needs to run the 0019 SQL in Supabase.` : error.message);
    router.replace(`/trip/${data.id}`);
  }

  if (rail)
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Rail base to Pacific National' }} />
        <Muted>Log each rail base you take to Pacific National. It goes to the office with your runsheet.</Muted>
        <Field label="Date (DD/MM/YYYY)" value={form.trip_date} onChangeText={set('trip_date')} />
        <Field
          label="Base ID (IFRU + 7 digits)"
          value={form.base_id}
          onChangeText={(v) => set('base_id')(cleanBaseId(v).slice(0, 11))}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="IFRU1234567"
          maxLength={11}
        />
        <Field label="Docket number" value={form.job_ref} onChangeText={set('job_ref')} autoCapitalize="characters" />
        <RegoPicker kind="truck" label="Truck rego" value={form.truck_rego} onChange={set('truck_rego')} />
        <RegoPicker kind="trailer" label="Trailer rego" value={form.trailer_rego} onChange={set('trailer_rego')} />
        <PlacePicker use="pickup" label="Collected from (optional)" value={form.pickup} onChange={set('pickup')} />
        <Field label="Notes" value={form.notes} onChangeText={set('notes')} multiline />
        <ErrorText>{error}</ErrorText>
        <Button title="Save rail base" onPress={save} busy={busy} />
      </Screen>
    );

  return (
    <Screen>
      {isOffice && <Stack.Screen options={{ title: editId ? 'Change load' : 'Plan a load' }} />}
      {isOffice && !editId && <Muted>The driver sees this load in their app straight away, under Active trips.</Muted>}
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
      <CustomerPicker value={form.customer} onChange={set('customer')} />
      <Field label="Job / docket number" value={form.job_ref} onChangeText={set('job_ref')} />
      <PlacePicker
        use="pickup"
        label="Pickup"
        value={form.pickup}
        onChange={set('pickup')}
        onPick={(p) => setForm((f) => (f.customer.trim() ? f : { ...f, customer: p.name }))}
      />
      <PlacePicker use="dropoff" label="Drop-off" value={form.dropoff} onChange={set('dropoff')} />
      <Field label="Start odometer (km)" value={form.start_odometer} onChangeText={set('start_odometer')} keyboardType="number-pad" />
      <Field label="Notes" value={form.notes} onChangeText={set('notes')} multiline />
      <ErrorText>{error}</ErrorText>
      <Button title={editId ? 'Save changes' : 'Save trip'} onPress={save} busy={busy} />
    </Screen>
  );
}
