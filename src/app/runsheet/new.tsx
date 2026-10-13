import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { Button, ErrorText, Field, Muted, Row, Screen, Title } from '@/components/ui';
import { alert } from '@/lib/alert';
import { useAuth } from '@/lib/auth';
import { callFunction } from '@/lib/drivers';
import { parseDateInput, toDMY, toISODate } from '@/lib/pay';
import { newId, pickPhotos, uploadPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';

/** End of day: the driver photographs their runsheet and sends it to the office. */
export default function NewRunsheet() {
  const { session } = useAuth();
  const [date, setDate] = useState(toDMY(toISODate(new Date())));
  const [truck, setTruck] = useState('');
  const [notes, setNotes] = useState('');
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
    const runDate = parseDateInput(date);
    if (!runDate) return setError('Enter the date like 13/10/2026.');
    if (!photos.length) return setError('Take a photo of your runsheet first.');
    setError(null);
    setBusy(true);
    try {
      const id = newId();
      const paths: string[] = [];
      for (const [i, uri] of photos.entries()) {
        setStatus(`Uploading photo ${i + 1} of ${photos.length}…`);
        const path = `${session.user.id}/${id}/${i + 1}.jpg`;
        await uploadPhoto('runsheet-photos', path, uri);
        paths.push(path);
      }
      setStatus('Sending…');
      const { error: e } = await supabase.from('runsheets').insert({
        id,
        driver_id: session.user.id,
        run_date: runDate,
        truck_rego: truck.trim().toUpperCase() || null,
        notes: notes.trim() || null,
        photo_paths: paths,
      });
      if (e) throw new Error(/relation|schema cache|bucket/i.test(e.message) ? `${e.message}. The office needs to run the 0008 SQL in Supabase.` : e.message);
      setStatus('Emailing the office…');
      // The runsheet is saved either way; the email is a copy for the office inbox.
      const emailed = await callFunction('licence-alerts', { runsheet_id: id }).then(
        () => null,
        (err) => (err instanceof Error ? err.message : String(err)),
      );
      alert(
        'Runsheet sent',
        emailed ? `The office can see it in the app, but the email didn't go: ${emailed}` : 'The office can see it in the app and has it by email.',
      );
      router.back();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/Bucket not found/i.test(msg) ? `${msg}. The office needs to run the 0008 SQL in Supabase.` : msg);
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  return (
    <Screen>
      <Muted>At the end of the day, take a clear photo of each page of your runsheet and send it to the office.</Muted>
      <Field label="Date (DD/MM/YYYY)" value={date} onChangeText={setDate} />
      <Field label="Truck rego" value={truck} onChangeText={setTruck} autoCapitalize="characters" />
      <Title>Runsheet photos</Title>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {photos.map((uri, i) => (
          <Pressable key={uri + i} onLongPress={() => setPhotos((p) => p.filter((_, j) => j !== i))}>
            <Image source={{ uri }} style={{ width: 104, height: 138, borderRadius: 10 }} />
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
      <Field label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />
      <ErrorText>{error}</ErrorText>
      {status && <Muted>{status}</Muted>}
      <Button title="Submit runsheet" onPress={submit} busy={busy} />
    </Screen>
  );
}
