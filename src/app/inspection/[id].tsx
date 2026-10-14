import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Text, View } from 'react-native';

import { Badge, Button, Card, ErrorText, Loading, Muted, Row, Screen, Title, colors } from '@/components/ui';
import { setArchived } from '@/lib/archive';
import { useAuth } from '@/lib/auth';
import { callFunction } from '@/lib/drivers';
import { formatDateTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Inspection } from '@/lib/types';
import { unwrap, useFocusQuery } from '@/lib/useQuery';

export default function InspectionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isOffice, session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const { data, loading, error, reload } = useFocusQuery(async () => {
    const insp = unwrap(
      await supabase
        .from('inspections')
        .select('*, driver:profiles!inspections_driver_id_fkey(full_name)')
        .eq('id', id)
        .single(),
    ) as Inspection;
    const urls: string[] = [];
    if (insp.photo_paths.length) {
      const { data: signed } = await supabase.storage.from('inspection-photos').createSignedUrls(insp.photo_paths, 3600);
      for (const s of signed ?? []) if (s.signedUrl) urls.push(s.signedUrl);
    }
    return { insp, urls };
  }, [id]);

  async function resend() {
    setBusy(true);
    setMsg(null);
    try {
      await callFunction('send-inspection', { inspection_id: id });
      setMsg('Email sent.');
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorText>{error ?? 'Not found'}</ErrorText>;
  const { insp, urls } = data;

  return (
    <Screen>
      <Card>
        <Title>{insp.truck_rego}</Title>
        <Badge
          label={insp.safe_to_drive ? 'Safe to drive' : 'NOT safe to drive'}
          color={insp.safe_to_drive ? colors.success : colors.danger}
        />
        <Text>Driver: {insp.driver?.full_name ?? '-'}</Text>
        <Text>When: {formatDateTime(insp.created_at)}</Text>
        {insp.trailer_rego && <Text>Trailer: {insp.trailer_rego}</Text>}
        {insp.visy_trailer && <Text>Visy trailer: {insp.visy_trailer}</Text>}
        {insp.odometer !== null && <Text>Odometer: {insp.odometer} km</Text>}
        <Muted>
          {insp.emailed_at
            ? `Emailed ${formatDateTime(insp.emailed_at)}`
            : `Not emailed${insp.email_error ? `: ${insp.email_error}` : ''}`}
        </Muted>
      </Card>
      <Card>
        {insp.items.map((it, i) => (
          <View key={it.key} style={{ paddingVertical: 4 }}>
            {it.section !== insp.items[i - 1]?.section && (
              <Text style={{ fontWeight: '800', marginTop: i ? 8 : 0 }}>{it.section === 'trailer' ? 'Trailer' : 'Truck'}</Text>
            )}
            <Row>
              <Text style={{ flex: 1 }}>{it.label}</Text>
              <Text style={{ fontWeight: '700', color: it.ok ? colors.success : colors.danger }}>
                {it.ok ? 'OK' : 'FAULT'}
              </Text>
            </Row>
            {!it.ok && <Muted>{it.note}</Muted>}
          </View>
        ))}
      </Card>
      {insp.notes && (
        <Card>
          <Text>{insp.notes}</Text>
        </Card>
      )}
      <View style={{ gap: 8 }}>
        {urls.map((u) => (
          <Image key={u} source={{ uri: u }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 8 }} resizeMode="cover" />
        ))}
      </View>
      {!insp.emailed_at && <Button title="Send email again" onPress={resend} busy={busy} />}
      {msg && <Muted>{msg}</Muted>}
      {isOffice && insp.archived_at && <Muted>Reviewed and archived {formatDateTime(insp.archived_at)}.</Muted>}
      {isOffice && session && (
        <Button
          title={insp.archived_at ? 'Put back on the To review list' : 'Reviewed: remove from list'}
          variant="secondary"
          onPress={() =>
            setArchived('inspections', id, !insp.archived_at, session.user.id).then(
              (done) => done && router.back(),
              (e: Error) => setMsg(e.message),
            )
          }
        />
      )}
    </Screen>
  );
}
