import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { DutyCard } from '@/components/DutyCard';
import { SignalWarning } from '@/components/SignalWarning';
import { Badge, Button, Card, Empty, ErrorText, Loading, Muted, Row, Screen, Segmented, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime, statusColor, statusLabel } from '@/lib/format';
import { addDays, toISODate } from '@/lib/pay';
import { supabase } from '@/lib/supabase';
import type { Trip } from '@/lib/types';
import { unwrap, useFocusQuery } from '@/lib/useQuery';

type Filter = 'active' | 'recent' | 'archive';

export default function TripsScreen() {
  const { isOffice, profile } = useAuth();
  const [filter, setFilter] = useState<Filter>('active');

  const { data, loading, error } = useFocusQuery(async () => {
    let q = supabase.from('trips').select('*, driver:profiles!trips_driver_id_fkey(full_name)');
    if (filter === 'archive') return unwrap(await q.not('archived_at', 'is', null).order('trip_date', { ascending: false }).limit(200)) as Trip[];
    q = q.is('archived_at', null);
    if (filter === 'active') q = q.neq('status', 'completed').order('trip_date');
    else q = q.gte('trip_date', addDays(toISODate(new Date()), -14)).order('trip_date', { ascending: false });
    return unwrap(await q.limit(200)) as Trip[];
  }, [filter]);

  return (
    <Screen>
      <Stack.Screen options={{ title: isOffice ? 'Trips' : `Hi ${profile?.full_name?.split(' ')[0] ?? ''}` }} />
      {isOffice ? (
        <>
          <SignalWarning showMapLink={false} />
          <Button title="Live map: where are my drivers?" variant="secondary" onPress={() => router.push('/live-map')} />
        </>
      ) : (
        <DutyCard />
      )}
      <Button title="+ New trip" onPress={() => router.push('/trip/new')} />
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'active', label: 'Planned & on the road' },
          { value: 'recent', label: 'Last 2 weeks' },
          ...(isOffice ? [{ value: 'archive' as const, label: 'Archive' }] : []),
        ]}
      />
      <ErrorText>{error}</ErrorText>
      {loading && !data ? (
        <Loading />
      ) : data?.length ? (
        data.map((t) => (
          <Card key={t.id} onPress={() => router.push(`/trip/${t.id}`)}>
            <Row>
              <Title>
                {t.pickup || '?'} → {t.dropoff || '?'}
              </Title>
            </Row>
            <Row>
              <Badge label={statusLabel[t.status]} color={statusColor[t.status]} />
              <Muted>
                {formatDate(t.trip_date)} · {t.truck_rego}
                {isOffice && t.driver ? ` · ${t.driver.full_name}` : ''}
              </Muted>
            </Row>
            {t.status === 'in_progress' && t.last_seen_at && (
              <View>
                <Text style={{ fontSize: 13 }}>Last location {formatDateTime(t.last_seen_at)}</Text>
              </View>
            )}
          </Card>
        ))
      ) : (
        <Empty>
          {filter === 'active'
            ? 'No open trips. Tap New trip to add one.'
            : filter === 'archive'
              ? 'Nothing archived yet.'
              : 'No trips in the last two weeks.'}
        </Empty>
      )}
    </Screen>
  );
}
