import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { RegoPicker } from '@/components/RegoPicker';
import { Button, ErrorText, Field, Muted, Row, Screen, Title } from '@/components/ui';
import { alert } from '@/lib/alert';
import { useAuth } from '@/lib/auth';
import { callFunction } from '@/lib/drivers';
import { numOrNull } from '@/lib/format';
import { parseDateInput, toDMY, toISODate } from '@/lib/pay';
import { newId, pickPhotos, uploadPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';

/** End of day: the driver photographs their runsheet (or a fuel docket) and sends it to the office. */
export default function NewRunsheet() {
  const { session } = useAuth();
  const fuel = useLocalSearchParams<{ kind?: string }>().kind === 'fuel';
  const noun = fuel ? 'fuel docket' : 'runsheet';
  const [litres, setLitres] = useState('');
  const [cost, setCost] = useState('');
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
    if (!photos.length) return setError(`Take a photo of your ${noun} first.`);
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
        ...(fuel ? { kind: 'fuel', litres: numOrNull(litres), fuel_cost: numOrNull(cost) } : {}),
      });
      if (e)
        throw new Error(
          /relation|schema cache|bucket|kind|litres/i.test(e.message)
            ? `${e.message}. The office needs to run the ${fuel ? '0012' : '0008'} SQL in Supabase.`
            : e.message,
        );
      setStatus('Emailing the office…');
      // The runsheet is saved either way; the email is a copy for the office inbox.
      const emailed = await callFunction('licence-alerts', { runsheet_id: id }).then(
        () => null,
        (err) => (err instanceof Error ? err.message : String(err)),
      );
      alert(
        fuel ? 'Fuel docket sent' : 'Runsheet sent',
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
      {fuel && <Stack.Screen options={{ title: 'Submit fuel docket' }} />}
      <Muted>
        {fuel
          ? 'Take a clear photo of the fuel docket (receipt) and send it to the office.'
          : 'At the end of the day, take a clear photo of each page of your runsheet and send it to the office.'}
      </Muted>
      <Field label="Date (DD/MM/YYYY)" value={date} onChangeText={setDate} />
      <RegoPicker kind="truck" label="Truck rego" value={truck} onChange={setTruck} />
      {fuel && (
        <Row>
          <View style={{ flex: 1 }}>
            <Field label="Litres" value={litres} onChangeText={setLitres} keyboardType="decimal-pad" placeholder="e.g. 350" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Cost ($)" value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="e.g. 680.50" />
          </View>
        </Row>
      )}
      <Title>{fuel ? 'Docket photos' : 'Runsheet photos'}</Title>
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
      <Button title={fuel ? 'Submit fuel docket' : 'Submit runsheet'} onPress={submit} busy={busy} />
    </Screen>
  );
}
