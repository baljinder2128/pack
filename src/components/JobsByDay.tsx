import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { formatDate, formatTime, statusColor, statusLabel } from '@/lib/format';
import { addDays, toISODate } from '@/lib/pay';
import { supabase } from '@/lib/supabase';
import type { Trip } from '@/lib/types';
import { unwrap, useFocusQuery } from '@/lib/useQuery';
import { Badge, Card, Empty, ErrorText, Loading, Muted, Row, Title, colors } from './ui';

/** One line for a trip: "A → B" or "Rail base IFRU1234567 · docket 55". */
export function tripTitle(t: Trip): string {
  return t.kind === 'rail' ? `Rail base ${t.base_id} → Pacific National` : `${t.pickup || '?'} → ${t.dropoff || '?'}`;
}

/**
 * Every job (trips and rail bases to Pacific National) for the last `days` days,
 * one card per day. Archived trips are included: this is the record.
 * With `driverId` it shows one driver (office, on their profile); otherwise
 * drivers see their own and the office sees everyone's.
 */
export function JobsByDay({ driverId, days = 14, showDriver = false }: { driverId?: string; days?: number; showDriver?: boolean }) {
  const { data, loading, error } = useFocusQuery(async () => {
    let q = supabase
      .from('trips')
      .select('*, driver:profiles!trips_driver_id_fkey(full_name)')
      .gte('trip_date', addDays(toISODate(new Date()), -(days - 1)))
      .order('trip_date', { ascending: false })
      .order('started_at', { ascending: true, nullsFirst: false })
      .limit(500);
    if (driverId) q = q.eq('driver_id', driverId);
    return unwrap(await q) as Trip[];
  }, [driverId, days]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data?.length) return <Empty>No jobs in the last {days} days.</Empty>;

  const byDay = new Map<string, Trip[]>();
  for (const t of data) byDay.set(t.trip_date, [...(byDay.get(t.trip_date) ?? []), t]);

  return (
    <>
      {[...byDay.entries()].map(([day, trips]) => {
        const rail = trips.filter((t) => t.kind === 'rail').length;
        const loads = trips.length - rail;
        return (
          <Card key={day}>
            <Row>
              <Title>{formatDate(day)}</Title>
              <Text style={{ marginLeft: 'auto', fontWeight: '700', color: colors.primary }}>
                {[loads ? `${loads} job${loads === 1 ? '' : 's'}` : '', rail ? `${rail} rail base${rail === 1 ? '' : 's'}` : '']
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Row>
            {trips.map((t) => (
              <Pressable key={t.id} onPress={() => router.push(`/trip/${t.id}`)}>
                <View style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border, gap: 2 }}>
                  <Text style={{ fontWeight: '600', color: colors.text }}>{tripTitle(t)}</Text>
                  <Row>
                    <Badge label={statusLabel[t.status]} color={statusColor[t.status]} />
                    <Muted>
                      {[
                        t.kind === 'rail' ? `Docket ${t.job_ref}` : t.customer,
                        t.kind !== 'rail' && t.job_ref,
                        t.truck_rego,
                        t.started_at && formatTime(t.started_at),
                        showDriver && t.driver?.full_name,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Muted>
                  </Row>
                </View>
              </Pressable>
            ))}
          </Card>
        );
      })}
    </>
  );
}
