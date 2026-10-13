import { Image, Linking, Platform, Pressable, View } from 'react-native';

import { Card, Muted, Title } from '@/components/ui';
import { formatDate, formatDateTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useFocusQuery } from '@/lib/useQuery';

type Renewal = { id: string; new_expiry: string; submitted_at: string; photo_paths: string[]; email_error: string | null };

/** Office, driver page: the latest renewed-licence photos the driver sent. */
export function LicencePhotos({ driverId }: { driverId: string }) {
  const { data } = useFocusQuery(async () => {
    const { data: rows, error } = await supabase
      .from('licence_renewals')
      .select('id, new_expiry, submitted_at, photo_paths, email_error')
      .eq('driver_id', driverId)
      .order('submitted_at', { ascending: false })
      .limit(1);
    if (error || !rows?.length) return null; // none yet, or 0009 not run
    const latest = rows[0] as Renewal;
    const { data: signed } = await supabase.storage.from('licence-photos').createSignedUrls(latest.photo_paths, 3600);
    return { latest, urls: (signed ?? []).map((s) => s.signedUrl).filter(Boolean) as string[] };
  }, [driverId]);

  if (!data) return null;
  return (
    <Card>
      <Title>Latest licence photo</Title>
      <Muted>
        Sent {formatDateTime(data.latest.submitted_at)} · new expiry {formatDate(data.latest.new_expiry)}
      </Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {data.urls.map((u) => (
          <Pressable key={u} onPress={() => (Platform.OS === 'web' ? window.open(u, '_blank') : Linking.openURL(u))}>
            <Image source={{ uri: u }} style={{ width: 200, height: 128, borderRadius: 10 }} resizeMode="cover" />
          </Pressable>
        ))}
      </View>
    </Card>
  );
}
