import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { DriverPicker } from '@/components/DriverPicker';
import { Button, ErrorText, Field, Screen, colors } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listDrivers } from '@/lib/drivers';
import { shiftHours, shiftTimes, toISODate } from '@/lib/pay';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

export default function NewShift() {
  const params = useLocalSearchParams<{ date?: string; start?: string; end?: string }>();
  const { session, isOffice } = useAuth();
  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [driverId, setDriverId] = useState<string | null>(session?.user.id ?? null);
  const [date, setDate] = useState(params.date ?? toISODate(new Date()));
  const [startTime, setStartTime] = useState(params.start ?? '');
  const [endTime, setEndTime] = useState(params.end ?? '');
  const [breakMin, setBreakMin] = useState('30');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOffice) listDrivers().then(setDrivers).catch(() => {});
  }, [isOffice]);

  const times = shiftTimes(date, startTime, endTime);
  const breakMinutes = Number(breakMin) || 0;
  const hours = times ? shiftHours(times.start.toISOString(), times.end.toISOString(), breakMinutes) : null;

  async function save() {
    if (!times) return setError('Enter a valid date (YYYY-MM-DD) and start/finish times like 06:30.');
    if (!driverId) return setError('Choose a driver.');
    setBusy(true);
    const { error } = await supabase.from('shifts').insert({
      driver_id: driverId,
      shift_date: date,
      start_at: times.start.toISOString(),
      end_at: times.end.toISOString(),
      break_minutes: breakMinutes,
      notes: notes.trim() || null,
    });
    setBusy(false);
    if (error) return setError(error.message);
    router.back();
  }

  return (
    <Screen>
      {isOffice && <DriverPicker drivers={drivers} value={driverId} onChange={setDriverId} />}
      <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
      <Field label="Start time (24h, e.g. 05:30)" value={startTime} onChangeText={setStartTime} keyboardType="numbers-and-punctuation" />
      <Field label="Finish time (24h, e.g. 17:15)" value={endTime} onChangeText={setEndTime} keyboardType="numbers-and-punctuation" />
      <Field label="Breaks (minutes)" value={breakMin} onChangeText={setBreakMin} keyboardType="number-pad" />
      <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
      {hours !== null && (
        <Text style={{ fontSize: 16, color: colors.primary, fontWeight: '700' }}>
          {hours} hrs worked{times && times.end.getDate() !== times.start.getDate() ? ' (finishes next day)' : ''}
        </Text>
      )}
      <ErrorText>{error}</ErrorText>
      <Button title="Save hours" onPress={save} busy={busy} />
    </Screen>
  );
}
