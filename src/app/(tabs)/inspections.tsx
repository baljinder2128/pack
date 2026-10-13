import { router } from 'expo-router';
import { useState } from 'react';

import { Badge, Button, Card, Empty, ErrorText, Loading, Muted, Row, Screen, Segmented, Title, colors } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Inspection } from '@/lib/types';
import { unwrap, useFocusQuery } from '@/lib/useQuery';

export default function InspectionsScreen() {
  const { isOffice } = useAuth();
  const [view, setView] = useState<'open' | 'archive'>('open');
  const { data, loading, error } = useFocusQuery(async () => {
    let q = supabase.from('inspections').select('*, driver:profiles!inspections_driver_id_fkey(full_name)');
    q = view === 'archive' ? q.not('archived_at', 'is', null) : q.is('archived_at', null);
    return unwrap(await q.order('created_at', { ascending: false }).limit(view === 'archive' ? 200 : 50)) as Inspection[];
  }, [view]);

  return (
    <Screen>
      <Button title="+ Start pre-trip inspection" onPress={() => router.push('/inspection/new')} />
      {isOffice && (
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'open', label: 'To review' },
            { value: 'archive', label: 'Archive (kept forever)' },
          ]}
        />
      )}
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
              {i.archived_at && <Muted>Reviewed {formatDateTime(i.archived_at)}</Muted>}
            </Card>
          );
        })
      ) : (
        <Empty>{view === 'archive' ? 'Nothing archived yet.' : 'No inspections to review.'}</Empty>
      )}
    </Screen>
  );
}
