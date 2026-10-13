import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { WeekNav } from '@/components/WeekNav';
import { Button, Card, Empty, ErrorText, Hero, Loading, Muted, Row, Screen, Title, colors } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDate, formatTime } from '@/lib/format';
import { addDays, money, round2, shiftHours, toISODate, weekStart } from '@/lib/pay';
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
        .select('*, driver:profiles!shifts_driver_id_fkey(full_name, hourly_rate)')
        .gte('shift_date', start)
        .lte('shift_date', addDays(start, 6)) // include Sunday so nothing logged is hidden
        .order('start_at'),
    ) as (Shift & { driver: { full_name: string; hourly_rate: number | null } | null })[];
  }, [start]);

  // Office sees everyone's hours, so total them per driver.
  // Pay goes up as soon as hours are logged: hours x the driver's hourly rate.
  const rate = (s: { driver?: { hourly_rate: number | null } | null }) => Number(s.driver?.hourly_rate) || 0;
  const totals = new Map<string, { name: string; hours: number; pay: number }>();
  for (const s of data ?? []) {
    const t = totals.get(s.driver_id) ?? { name: s.driver?.full_name ?? '', hours: 0, pay: 0 };
    const h = shiftHours(s.start_at, s.end_at, s.break_minutes);
    t.hours = round2(t.hours + h);
    t.pay = round2(t.pay + h * rate(s));
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
        <Hero
          label="This week so far"
          value={`${round2([...totals.values()].reduce((h, t) => h + t.hours, 0))} hrs`}
          sub={(() => {
            const pay = round2([...totals.values()].reduce((p, t) => p + t.pay, 0));
            return pay > 0 ? `${money(pay)} earned from hours` : undefined;
          })()}
        >
          {isOffice &&
            [...totals.values()].map((t) => (
              <Text key={t.name} style={{ color: '#d4d6dc', fontSize: 15 }}>
                {t.name}: <Text style={{ color: '#fff', fontWeight: '700' }}>{t.hours} hrs</Text>
                {t.pay > 0 ? ` · ${money(t.pay)}` : ''}
              </Text>
            ))}
          <Text style={{ color: '#8b8f9a', fontSize: 12, marginTop: 4 }}>
            Trips and the full pay are on the {isOffice ? 'Pay' : 'My pay'} tab.
          </Text>
        </Hero>
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
                {rate(s) > 0 ? ` · ${money(round2(shiftHours(s.start_at, s.end_at, s.break_minutes) * rate(s)))}` : ''}
              </Text>
            </Row>
            <Muted>
              {formatTime(s.start_at)} – {formatTime(s.end_at)} · {s.break_minutes} min break
              {isOffice && s.driver ? ` · ${s.driver.full_name}` : ''}
            </Muted>
            {s.notes && <Muted>{s.notes}</Muted>}
            <Row>
              <Text
                style={{ color: colors.primary, fontWeight: '600', marginTop: 4, marginRight: 24 }}
                onPress={() => router.push({ pathname: '/shift/new', params: { id: s.id } })}
              >
                Edit
              </Text>
              <Text style={{ color: colors.danger, marginTop: 4 }} onPress={() => remove(s)}>
                Delete
              </Text>
            </Row>
          </Card>
        ))
      ) : (
        <Empty>No hours logged this week.</Empty>
      )}
    </Screen>
  );
}
