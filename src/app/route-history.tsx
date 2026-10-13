import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { DriverPicker } from '@/components/DriverPicker';
import { RouteMap } from '@/components/MapFrame';
import { Card, Empty, ErrorText, Loading, Muted, Screen, Title, colors, styles } from '@/components/ui';
import { listDrivers } from '@/lib/drivers';
import { formatDate, formatTime } from '@/lib/format';
import { addDays, parseISODate, toISODate } from '@/lib/pay';
import { supabase } from '@/lib/supabase';
import { useFocusQuery } from '@/lib/useQuery';

type Point = { lat: number; lng: number; recorded_at: string };

/** Distance in km between two points (haversine). */
function km(a: Point, b: Point): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Office: where a driver went on any of the last 7 days. */
export default function RouteHistory() {
  const today = toISODate(new Date());
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(today, -i));
  const [day, setDay] = useState(today);
  const [driverId, setDriverId] = useState<string | null>(null);

  const drivers = useFocusQuery(async () => (await listDrivers({ includeRemoved: true })).filter((d) => d.role === 'driver'), []);

  const route = useFocusQuery(async () => {
    if (!driverId) return null;
    const from = parseISODate(day);
    const to = parseISODate(addDays(day, 1));
    // Read in pages: Supabase returns at most 1000 rows per request.
    const points: Point[] = [];
    for (let page = 0; page < 20; page++) {
      const { data, error } = await supabase
        .from('driver_locations')
        .select('lat,lng,recorded_at')
        .eq('driver_id', driverId)
        .gte('recorded_at', from.toISOString())
        .lt('recorded_at', to.toISOString())
        .order('recorded_at')
        .range(page * 1000, page * 1000 + 999);
      if (error) throw new Error(error.message);
      points.push(...((data ?? []) as Point[]));
      if (!data || data.length < 1000) break;
    }
    let distance = 0;
    for (let i = 1; i < points.length; i++) {
      const step = km(points[i - 1], points[i]);
      if (step < 50) distance += step; // skip GPS jumps
    }
    return { points, distance };
  }, [driverId, day]);

  const pts = route.data?.points ?? [];

  return (
    <Screen>
      {drivers.data && <DriverPicker drivers={drivers.data} value={driverId} onChange={setDriverId} />}
      <View style={styles.field}>
        <Text style={styles.label}>Day</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {days.map((d) => {
            const selected = d === day;
            return (
              <Pressable
                key={d}
                onPress={() => setDay(d)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primary : colors.card,
                }}
              >
                <Text style={{ color: selected ? '#fff' : colors.text }}>{d === today ? 'Today' : formatDate(d)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <ErrorText>{route.error ?? drivers.error}</ErrorText>
      {!driverId ? (
        <Empty>Choose a driver to see where they went.</Empty>
      ) : route.loading && !route.data ? (
        <Loading />
      ) : pts.length === 0 ? (
        <Empty>No locations recorded for this driver on {formatDate(day)}.</Empty>
      ) : (
        <>
          <Card>
            <Title>{formatDate(day)}</Title>
            <Muted>
              {formatTime(pts[0].recorded_at)} to {formatTime(pts[pts.length - 1].recorded_at)} · about{' '}
              {Math.round(route.data!.distance)} km · {pts.length} location updates
            </Muted>
          </Card>
          <View style={{ height: 460, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
            <RouteMap track={pts.map((p) => [p.lat, p.lng])} />
          </View>
          <Muted>Gaps in the line mean the driver's phone wasn't sending (app closed or no signal).</Muted>
        </>
      )}
    </Screen>
  );
}
