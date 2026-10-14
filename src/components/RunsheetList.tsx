import { router } from 'expo-router';
import { Text } from 'react-native';

import { Badge, Button, Card, Empty, ErrorText, Loading, Muted, Row, Title, colors } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime } from '@/lib/format';
import { addDays, money, toISODate } from '@/lib/pay';
import { supabase } from '@/lib/supabase';
import type { Runsheet } from '@/lib/types';
import { unwrap, useFocusQuery } from '@/lib/useQuery';

/** Trips tab, Runsheets / Fuel: drivers send runsheets and fuel dockets; office checks them. */
export function RunsheetList({ kind = 'runsheet' }: { kind?: 'runsheet' | 'fuel' }) {
  const { isOffice } = useAuth();
  const fuel = kind === 'fuel';
  const noun = fuel ? 'fuel docket' : 'runsheet';
  const today = toISODate(new Date());
  const { data, loading, error } = useFocusQuery(async () => {
    return unwrap(
      await supabase
        .from('runsheets')
        .select('*, driver:profiles!runsheets_driver_id_fkey(full_name)')
        .eq('kind', kind)
        .gte('run_date', addDays(today, -30))
        .order('run_date', { ascending: false })
        .order('submitted_at', { ascending: false })
        .limit(300),
    ) as Runsheet[];
  }, [today, kind]);

  const sentToday = data?.some((r) => r.run_date === today);
  const waiting = data?.filter((r) => !r.reviewed_at).length ?? 0;

  return (
    <>
      {!isOffice && (
        <>
          <Button
            title={fuel ? '+ Submit a fuel docket' : sentToday ? '+ Send another page for today' : "+ Submit today's runsheet"}
            onPress={() => router.push(fuel ? '/runsheet/new?kind=fuel' : '/runsheet/new')}
          />
          {data && !sentToday && !fuel && (
            <Text style={{ color: colors.warning, fontWeight: '600' }}>You haven't sent today's runsheet yet.</Text>
          )}
        </>
      )}
      {isOffice && data && (
        <Muted>
          {waiting
            ? `${waiting} ${noun}${waiting === 1 ? '' : 's'} to check · last 30 days`
            : `All ${noun}s checked · last 30 days`}
        </Muted>
      )}
      <ErrorText>
        {error && /runsheets|schema cache|kind/i.test(error)
          ? `${error}. Run the ${fuel ? '0012' : '0008'} SQL in Supabase to turn on ${noun}s.`
          : error}
      </ErrorText>
      {loading && !data ? (
        <Loading />
      ) : data?.length ? (
        data.map((r) => (
          <Card key={r.id} onPress={() => router.push(`/runsheet/${r.id}`)}>
            <Row>
              <Title>{formatDate(r.run_date)}</Title>
              <Text style={{ marginLeft: 'auto', color: colors.muted }}>
                {r.photo_paths.length} photo
                {r.photo_paths.length === 1 ? '' : 's'}
              </Text>
            </Row>
            <Row>
              <Badge
                label={r.reviewed_at ? 'Checked' : 'To check'}
                color={r.reviewed_at ? colors.success : colors.warning}
              />
              <Muted>
                {isOffice && r.driver ? `${r.driver.full_name} · ` : ''}
                {r.truck_rego ? `${r.truck_rego} · ` : ''}
                {r.litres ? `${r.litres} L · ` : ''}
                {r.fuel_cost ? `${money(r.fuel_cost)} · ` : ''}sent {formatDateTime(r.submitted_at)}
              </Muted>
            </Row>
          </Card>
        ))
      ) : (
        <Empty>{isOffice ? `No ${noun}s sent in the last 30 days.` : `No ${noun}s sent yet.`}</Empty>
      )}
    </>
  );
}
