import { router } from 'expo-router';

import { Badge, Button, Card, Empty, ErrorText, Loading, Muted, Row, Screen, Title, colors } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Inspection } from '@/lib/types';
import { unwrap, useFocusQuery } from '@/lib/useQuery';

export default function InspectionsScreen() {
  const { isOffice } = useAuth();
  const { data, loading, error } = useFocusQuery(async () => {
    return unwrap(
      await supabase
        .from('inspections')
        .select('*, driver:profiles!inspections_driver_id_fkey(full_name)')
        .order('created_at', { ascending: false })
        .limit(50),
    ) as Inspection[];
  }, []);

  return (
    <Screen>
      <Button title="+ Start pre-trip inspection" onPress={() => router.push('/inspection/new')} />
      <ErrorText>{error}</ErrorText>
      {loading && !data ? (
        <Loading />
      ) : data?.length ? (
        data.map((i) => {
          const defects = i.items.filter((it) => !it.ok).length;
          return (
            <Card key={i.id} onPress={() => router.push(`/inspection/${i.id}`)}>
              <Title>{i.truck_rego}</Title>
              <Row>
                <Badge
                  label={!i.safe_to_drive ? 'Not safe' : defects ? `${defects} defect(s)` : 'All OK'}
                  color={!i.safe_to_drive ? colors.danger : defects ? colors.warning : colors.success}
                />
                <Muted>
                  {formatDateTime(i.created_at)}
                  {isOffice && i.driver ? ` · ${i.driver.full_name}` : ''}
                </Muted>
              </Row>
              {!i.emailed_at && <Muted>Email not sent yet</Muted>}
            </Card>
          );
        })
      ) : (
        <Empty>No inspections yet.</Empty>
      )}
    </Screen>
  );
}
