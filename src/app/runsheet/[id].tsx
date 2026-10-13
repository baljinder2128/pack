import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Linking, Platform, Pressable, Text, View } from 'react-native';

import { Badge, Button, Card, ErrorText, Loading, Muted, Screen, Title, colors } from '@/components/ui';
import { alert } from '@/lib/alert';
import { useAuth } from '@/lib/auth';
import { callFunction } from '@/lib/drivers';
import { formatDate, formatDateTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Runsheet } from '@/lib/types';
import { unwrap, useFocusQuery } from '@/lib/useQuery';

export default function RunsheetDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isOffice, session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, loading, error: loadError, reload } = useFocusQuery(async () => {
    const sheet = unwrap(
      await supabase
        .from('runsheets')
        .select('*, driver:profiles!runsheets_driver_id_fkey(full_name)')
        .eq('id', id)
        .single(),
    ) as Runsheet;
    const urls: string[] = [];
    if (sheet.photo_paths.length) {
      const { data: signed } = await supabase.storage.from('runsheet-photos').createSignedUrls(sheet.photo_paths, 3600);
      for (const s of signed ?? []) if (s.signedUrl) urls.push(s.signedUrl);
    }
    return { sheet, urls };
  }, [id]);

  async function toggleChecked() {
    if (!data) return;
    setBusy(true);
    setError(null);
    const checked = !data.sheet.reviewed_at;
    const { error: e } = await supabase
      .from('runsheets')
      .update({ reviewed_at: checked ? new Date().toISOString() : null, reviewed_by: checked ? session?.user.id : null })
      .eq('id', id);
    setBusy(false);
    if (e) return setError(e.message);
    reload();
  }

  async function emailOffice() {
    setBusy(true);
    setError(null);
    try {
      await callFunction('licence-alerts', { runsheet_id: id });
      alert('Emailed', 'The runsheet and its photos were emailed to the office.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (!data) return;
    alert('Delete this runsheet?', 'Its photos are deleted too. You can then send a new one.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          setError(null);
          // Delete the row first: if that's refused (already checked), the photos stay.
          const { data: gone, error: e } = await supabase.from('runsheets').delete().eq('id', id).select('id');
          if (e || !gone?.length) {
            setBusy(false);
            return setError(
              e ? (/permission|policy/i.test(e.message) ? `${e.message}. The office needs to run the 0011 SQL in Supabase.` : e.message)
                : 'The office has already checked this runsheet, so only the office can delete it.',
            );
          }
          if (data.sheet.photo_paths.length) await supabase.storage.from('runsheet-photos').remove(data.sheet.photo_paths);
          setBusy(false);
          router.back();
        },
      },
    ]);
  }

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorText>{loadError ?? 'Not found'}</ErrorText>;
  const { sheet, urls } = data;

  return (
    <Screen>
      <Card>
        <Title>Runsheet · {formatDate(sheet.run_date)}</Title>
        <Badge
          label={sheet.reviewed_at ? 'Checked by office' : 'Waiting for office'}
          color={sheet.reviewed_at ? colors.success : colors.warning}
        />
        <Text>Driver: {sheet.driver?.full_name ?? '-'}</Text>
        {sheet.truck_rego && <Text>Truck: {sheet.truck_rego}</Text>}
        <Muted>Sent {formatDateTime(sheet.submitted_at)}</Muted>
        {sheet.notes && <Text style={{ marginTop: 4 }}>{sheet.notes}</Text>}
      </Card>
      <Muted>Tap a photo to open it full size.</Muted>
      <View style={{ gap: 10 }}>
        {urls.map((u) => (
          <Pressable
            key={u}
            onPress={() => (Platform.OS === 'web' ? window.open(u, '_blank') : Linking.openURL(u))}
            accessibilityRole="imagebutton"
          >
            <Image source={{ uri: u }} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 12 }} resizeMode="contain" />
          </Pressable>
        ))}
      </View>
      <ErrorText>{error}</ErrorText>
      {isOffice && (
        <Button
          title={sheet.reviewed_at ? 'Mark as not checked' : 'Checked: runsheet is OK'}
          variant={sheet.reviewed_at ? 'secondary' : 'success'}
          onPress={toggleChecked}
          busy={busy}
        />
      )}
      <Button title="Email this runsheet to the office" variant="secondary" onPress={emailOffice} busy={busy} />
      {(isOffice || !sheet.reviewed_at) && <Button title="Delete runsheet" variant="danger" onPress={remove} busy={busy} />}
      {!isOffice && !sheet.reviewed_at && <Muted>Made a mistake? Delete it and send a new one.</Muted>}
    </Screen>
  );
}
