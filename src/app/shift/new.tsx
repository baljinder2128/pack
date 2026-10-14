import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { DriverPicker } from '@/components/DriverPicker';
import { Button, ErrorText, Field, Screen, colors } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listDrivers } from '@/lib/drivers';
import { clock24, parseDateInput, shiftHours, shiftTimes, toDMY, toISODate } from '@/lib/pay';
import { supabase } from '@/lib/supabase';
import type { Profile, Shift } from '@/lib/types';

/** Log hours, or edit them when opened with ?id= (drivers their own, office anyone's). */
export default function NewShift() {
  const params = useLocalSearchParams<{ id?: string; date?: string; start?: string; end?: string }>();
  const editing = !!params.id;
  const { session, isOffice } = useAuth();
  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [driverId, setDriverId] = useState<string | null>(session?.user.id ?? null);
  const [date, setDate] = useState(toDMY(params.date ?? toISODate(new Date())));
  const [startTime, setStartTime] = useState(params.start ?? '');
  const [endTime, setEndTime] = useState(params.end ?? '');
  const [breakMin, setBreakMin] = useState('30');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOffice) listDrivers().then(setDrivers).catch(() => {});
  }, [isOffice]);

  useEffect(() => {
    if (!params.id) return;
    supabase
      .from('shifts')
      .select('*')
      .eq('id', params.id)
      .single()
      .then(({ data, error: e }) => {
        if (e || !data) return setError(e?.message ?? 'Could not load these hours.');
        const shift = data as Shift;
        setDriverId(shift.driver_id);
        setDate(toDMY(shift.shift_date));
        setStartTime(clock24(new Date(shift.start_at)));
        setEndTime(clock24(new Date(shift.end_at)));
        setBreakMin(String(shift.break_minutes));
        setNotes(shift.notes ?? '');
      });
  }, [params.id]);

  const isoDate = parseDateInput(date);
  const times = isoDate ? shiftTimes(isoDate, startTime, endTime) : null;
  const breakMinutes = Number(breakMin) || 0;
  const hours = times ? shiftHours(times.start.toISOString(), times.end.toISOString(), breakMinutes) : null;

  async function save() {
    if (!times) return setError('Enter the date like 13/10/2026 and start/finish times like 06:30 or 4:30 pm.');
    if (times.end.getTime() - times.start.getTime() >= 24 * 60 * 60000)
      return setError('Start and finish are the same time. Change the finish time.');
    if (!driverId) return setError('Choose a driver.');
    setBusy(true);
    const row = {
      driver_id: driverId,
      shift_date: isoDate,
      start_at: times.start.toISOString(),
      end_at: times.end.toISOString(),
      break_minutes: breakMinutes,
      notes: notes.trim() || null,
    };
    const { error } = editing
      ? await supabase.from('shifts').update(row).eq('id', params.id!)
      : await supabase.from('shifts').insert(row);
    setBusy(false);
    if (error)
      return setError(
        !isOffice && /row-level security/i.test(error.message)
          ? 'That week has already been paid, so only the office can change its hours. Call the office.'
          : error.message,
      );
    router.back();
  }

  if (!isOffice)
    return (
      <Screen>
        <Text style={{ color: colors.muted, fontSize: 16 }}>
          Your hours are logged automatically, from your first trip of the shift to going off duty. Only the office can change them.
        </Text>
      </Screen>
    );

  return (
    <Screen>
      {editing && <Stack.Screen options={{ title: 'Edit hours' }} />}
      {isOffice && <DriverPicker drivers={drivers} value={driverId} onChange={setDriverId} />}
      <Field label="Date (DD/MM/YYYY)" value={date} onChangeText={setDate} />
      <Field label="Start time (e.g. 05:30 or 5:30 am)" value={startTime} onChangeText={setStartTime} keyboardType="numbers-and-punctuation" />
      <Field label="Finish time (e.g. 17:15 or 5:15 pm)" value={endTime} onChangeText={setEndTime} keyboardType="numbers-and-punctuation" />
      <Field label="Breaks (minutes)" value={breakMin} onChangeText={setBreakMin} keyboardType="number-pad" />
      <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
      {hours !== null && (
        <Text style={{ fontSize: 16, color: colors.primary, fontWeight: '700' }}>
          {hours} hrs worked{times && times.end.getDate() !== times.start.getDate() ? ' (finishes next day)' : ''}
        </Text>
      )}
      <ErrorText>{error}</ErrorText>
      {editing && (
        <Text style={{ color: colors.muted }}>
          If this week's RCTI or payslip is already done, tap Update on the Pay tab after saving so it is paid right.
        </Text>
      )}
      <Button title={editing ? 'Save changes' : 'Save hours'} onPress={save} busy={busy} />
    </Screen>
  );
}
