import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { WeekNav } from '@/components/WeekNav';
import { Button, Card, Empty, ErrorText, Loading, Muted, Row, Screen, Title, colors } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDate, formatTime } from '@/lib/format';
import { round2, shiftHours, toISODate, weekEnd, weekStart } from '@/lib/pay';
import { supabase } from '@/lib/supabase';
import type { Shift } from '@/lib/types';
import { unwrap, useFocusQuery } from '@/lib/useQuery';
import { alert } from '@/lib/alert';

export default function HoursScreen() {
  const { isOffice } = useAuth();
  const [start, setStart] = useState(weekStart(toISODate(new Date())));

  const { data, loading, error, reload } = useFocusQuery(async () => {
    return unwrap(
      await supabase
        .from('shifts')
        .select('*, driver:profiles!shifts_driver_id_fkey(full_name)')
        .gte('shift_date', start)
        .lte('shift_date', weekEnd(start))
        .order('start_at'),
    ) as Shift[];
  }, [start]);

  // Office sees everyone's hours, so total them per driver.
  const totals = new Map<string, { name: string; hours: number }>();
  for (const s of data ?? []) {
    const t = totals.get(s.driver_id) ?? { name: s.driver?.full_name ?? '', hours: 0 };
    t.hours = round2(t.hours + shiftHours(s.start_at, s.end_at, s.break_minutes));
    totals.set(s.driver_id, t);
  }

  function remove(shift: Shift) {
    alert('Delete these hours?', `${formatDate(shift.shift_date)} ${formatTime(shift.start_at)}–${formatTime(shift.end_at)}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('shifts').delete().eq('id', shift.id);
          reload();
        },
      },
    ]);
  }

  return (
    <Screen>
      <Button title="+ Log hours" onPress={() => router.push('/shift/new')} />
      <WeekNav start={start} onChange={setStart} />
      <ErrorText>{error}</ErrorText>
      {totals.size > 0 && (
        <Card>
          <Title>Week total</Title>
          {[...totals.values()].map((t) => (
            <Text key={t.name} style={{ fontSize: 16 }}>
              {isOffice ? `${t.name}: ` : ''}
              <Text style={{ fontWeight: '700' }}>{t.hours} hrs</Text>
            </Text>
          ))}
        </Card>
      )}
      {loading && !data ? (
        <Loading />
      ) : data?.length ? (
        data.map((s) => (
          <Card key={s.id}>
            <Row>
              <Title>{formatDate(s.shift_date)}</Title>
              <Text style={{ marginLeft: 'auto', fontWeight: '700', color: colors.primary }}>
                {shiftHours(s.start_at, s.end_at, s.break_minutes)} hrs
              </Text>
            </Row>
            <Muted>
              {formatTime(s.start_at)} – {formatTime(s.end_at)} · {s.break_minutes} min break
              {isOffice && s.driver ? ` · ${s.driver.full_name}` : ''}
            </Muted>
            {s.notes && <Muted>{s.notes}</Muted>}
            <Text style={{ color: colors.danger, marginTop: 4 }} onPress={() => remove(s)}>
              Delete
            </Text>
          </Card>
        ))
      ) : (
        <Empty>No hours logged this week.</Empty>
      )}
    </Screen>
  );
}
