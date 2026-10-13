import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Badge, Button, Card, ErrorText, Field, Loading, Muted, Row, Screen, Title, colors } from '@/components/ui';
import { setArchived } from '@/lib/archive';
import { callFunction } from '@/lib/drivers';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime, numOrNull, openMap, statusColor, statusLabel } from '@/lib/format';
import { money } from '@/lib/pay';
import { supabase } from '@/lib/supabase';
import type { Trip } from '@/lib/types';
import { unwrap, useFocusQuery } from '@/lib/useQuery';

async function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

export default function TripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, isOffice } = useAuth();
  const [endOdo, setEndOdo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: trip, loading, error, reload } = useFocusQuery(async () => {
    const t = unwrap(
      await supabase.from('trips').select('*, driver:profiles!trips_driver_id_fkey(full_name)').eq('id', id).single(),
    ) as Trip;
    setAmount(t.amount ? String(t.amount) : '');
    setEndOdo(t.end_odometer ? String(t.end_odometer) : '');
    return t;
  }, [id]);

  const isMine = trip?.driver_id === session?.user.id;

  async function update(patch: Partial<Trip>) {
    setBusy(true);
    setActionError(null);
    const { error } = await supabase.from('trips').update(patch).eq('id', id);
    setBusy(false);
    if (error) setActionError(error.message);
    else reload();
  }

  async function accept() {
    setBusy(true);
    setActionError(null);
    const { error: e } = await supabase.from('trips').update({ accepted_at: new Date().toISOString() }).eq('id', id);
    if (e) {
      setBusy(false);
      return setActionError(/accepted_at|schema cache/i.test(e.message) ? `${e.message}. The office needs to run the 0013 SQL in Supabase.` : e.message);
    }
    // The office is emailed; the load is accepted either way.
    const emailError = await callFunction('licence-alerts', { trip_id: id }).then(
      () => null,
      (err) => (err instanceof Error ? err.message : String(err)),
    );
    setBusy(false);
    if (emailError) setActionError(`Accepted, but the email to the office didn't go: ${emailError}`);
    reload();
  }

  async function start() {
    const pos = await currentPosition();
    const now = new Date().toISOString();
    update({
      status: 'in_progress',
      started_at: now,
      start_lat: pos?.lat ?? null,
      start_lng: pos?.lng ?? null,
      last_lat: pos?.lat ?? null,
      last_lng: pos?.lng ?? null,
      last_seen_at: pos ? now : null,
    });
  }

  async function finish() {
    const odo = numOrNull(endOdo);
    if (trip?.start_odometer && odo !== null && odo < trip.start_odometer)
      return setActionError('End odometer is less than the start odometer.');
    const pos = await currentPosition();
    const now = new Date().toISOString();
    update({
      status: 'completed',
      finished_at: now,
      end_odometer: odo,
      end_lat: pos?.lat ?? null,
      end_lng: pos?.lng ?? null,
      last_lat: pos?.lat ?? trip?.last_lat ?? null,
      last_lng: pos?.lng ?? trip?.last_lng ?? null,
      last_seen_at: pos ? now : trip?.last_seen_at ?? null,
    });
  }

  async function archive() {
    if (!trip || !session) return;
    try {
      if (await setArchived('trips', trip.id, !trip.archived_at, session.user.id)) router.back();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading && !trip) return <Loading />;
  if (!trip) return <ErrorText>{error ?? 'Trip not found'}</ErrorText>;

  const km = trip.start_odometer && trip.end_odometer ? trip.end_odometer - trip.start_odometer : null;

  return (
    <Screen>
      <Card>
        <Title>
          {trip.pickup} → {trip.dropoff}
        </Title>
        <Row>
          <Badge label={statusLabel[trip.status]} color={statusColor[trip.status]} />
          <Muted>{formatDate(trip.trip_date)}</Muted>
        </Row>
        <Text>Driver: {trip.driver?.full_name ?? '-'}</Text>
        <Text>
          Truck: {trip.truck_rego}
          {trip.trailer_rego ? ` · Trailer: ${trip.trailer_rego}` : ''}
        </Text>
        {trip.customer && <Text>Customer: {trip.customer}</Text>}
        {trip.job_ref && <Text>Job: {trip.job_ref}</Text>}
        <Text>
          Odometer: {trip.start_odometer ?? '-'} → {trip.end_odometer ?? '-'}
          {km !== null ? ` (${km} km)` : ''}
        </Text>
        {trip.status === 'planned' && (
          <Text style={{ fontWeight: '700', color: trip.accepted_at ? colors.success : colors.warning }}>
            {trip.accepted_at ? `Accepted by driver ${formatDateTime(trip.accepted_at)}` : 'Not accepted by the driver yet'}
          </Text>
        )}
        <Text>Started: {formatDateTime(trip.started_at)}</Text>
        <Text>Finished: {formatDateTime(trip.finished_at)}</Text>
        {isOffice && <Text>Pay: {money(trip.amount)} inc GST</Text>}
        {trip.notes && <Muted>{trip.notes}</Muted>}
      </Card>

      {trip.last_lat !== null && trip.last_lng !== null && (
        <Button
          title={`Show on map (${formatDateTime(trip.last_seen_at)})`}
          variant="secondary"
          onPress={() => openMap(trip.last_lat!, trip.last_lng!)}
        />
      )}

      {trip.status === 'planned' && isMine && !trip.accepted_at && (
        <Button title="Accept this load" onPress={accept} busy={busy} />
      )}
      {trip.status === 'planned' && (
        <>
          <Button
            title="Do pre-trip inspection"
            variant="secondary"
            onPress={() =>
              router.push({
                pathname: '/inspection/new',
                params: { trip_id: trip.id, truck: trip.truck_rego, trailer: trip.trailer_rego ?? '' },
              })
            }
          />
          <Button title="Start trip" variant="success" onPress={start} busy={busy} />
        </>
      )}

      {trip.status === 'in_progress' && (
        <>
          {isMine && <Muted>The office can follow this trip while you are on duty.</Muted>}
          <Field label="End odometer (km)" value={endOdo} onChangeText={setEndOdo} keyboardType="number-pad" />
          <Button title="Finish trip" variant="success" onPress={finish} busy={busy} />
        </>
      )}

      {isOffice && (
        <Card>
          <Field label="Trip pay ($, inc GST)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          <Button title="Save pay" onPress={() => update({ amount: numOrNull(amount) ?? 0 })} busy={busy} />
        </Card>
      )}

      <ErrorText>{actionError}</ErrorText>
      {isOffice && trip.archived_at && <Muted>Reviewed and archived {formatDateTime(trip.archived_at)}.</Muted>}
      {isOffice && (
        <Button
          title={trip.archived_at ? 'Put back on the trip list' : 'Reviewed: remove from list'}
          variant="secondary"
          onPress={archive}
        />
      )}
    </Screen>
  );
}
