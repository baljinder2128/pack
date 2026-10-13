import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { Button, Card, ErrorText, Field, Muted, Row, Screen, Title } from '@/components/ui';
import { alert } from '@/lib/alert';
import { useAuth } from '@/lib/auth';
import { callFunction } from '@/lib/drivers';
import { formatDate } from '@/lib/format';
import { parseDateInput } from '@/lib/pay';
import { newId, pickPhotos, uploadPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';

/** Driver: photograph a renewed licence and send it to the office. */
export default function LicenceRenewal() {
  const { session, profile, refreshProfile } = useAuth();
  const [expiry, setExpiry] = useState('');
  const [number, setNumber] = useState(profile?.licence_number ?? '');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(source: 'camera' | 'library') {
    const uris = await pickPhotos(source);
    setPhotos((p) => [...p, ...uris]);
  }

  async function submit() {
    if (!session) return;
    const newExpiry = parseDateInput(expiry);
    if (!newExpiry) return setError('Enter the new expiry date from your licence, like 13/10/2031.');
    if (profile?.licence_expiry && newExpiry <= profile.licence_expiry)
      return setError('The new expiry date must be after your old one. Check the date on your new licence.');
    if (!photos.length) return setError('Take a photo of your new licence (front, and back if it has details).');
    setError(null);
    setBusy(true);
    try {
      const id = newId();
      const paths: string[] = [];
      for (const [i, uri] of photos.entries()) {
        setStatus(`Uploading photo ${i + 1} of ${photos.length}…`);
        const path = `${session.user.id}/${id}/${i + 1}.jpg`;
        await uploadPhoto('licence-photos', path, uri);
        paths.push(path);
      }
      setStatus('Sending to the office…');
      const { error: e } = await supabase.from('licence_renewals').insert({
        id,
        driver_id: session.user.id,
        old_expiry: profile?.licence_expiry ?? null,
        new_expiry: newExpiry,
        licence_number: number.trim() || null,
        photo_paths: paths,
      });
      if (e) throw new Error(e.message);
      await callFunction('licence-alerts', { renewal_id: id });
      await refreshProfile();
      alert('Licence sent', 'The office has been emailed your new licence. Thanks!');
      router.back();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        /Bucket not found|licence_renewals|schema cache|Failed to send a request/i.test(msg)
          ? `${msg}. The office needs to finish setting up licence renewals in Supabase.`
          : msg,
      );
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  return (
    <Screen>
      <Card>
        <Title>Renewed your licence?</Title>
        <Muted>
          {profile?.licence_expiry
            ? `Your licence on file expires ${formatDate(profile.licence_expiry)}.`
            : 'The office has no licence expiry on file for you.'}{' '}
          Take a clear photo of your new licence and send it to the office.
        </Muted>
      </Card>
      <Field label="New expiry date (DD/MM/YYYY)" value={expiry} onChangeText={setExpiry} />
      <Field label="Licence number" value={number} onChangeText={setNumber} autoCapitalize="characters" />
      <Title>Licence photos</Title>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {photos.map((uri, i) => (
          <Pressable key={uri + i} onLongPress={() => setPhotos((p) => p.filter((_, j) => j !== i))}>
            <Image source={{ uri }} style={{ width: 150, height: 96, borderRadius: 10 }} />
          </Pressable>
        ))}
      </View>
      {photos.length > 0 && <Muted>Press and hold a photo to remove it.</Muted>}
      <Row>
        <View style={{ flex: 1 }}>
          <Button title="Take photo" variant="secondary" onPress={() => add('camera')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="From gallery" variant="secondary" onPress={() => add('library')} />
        </View>
      </Row>
      <ErrorText>{error}</ErrorText>
      {status && <Muted>{status}</Muted>}
      <Button title="Send to office" onPress={submit} busy={busy} />
    </Screen>
  );
}
