import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Platform, Pressable, Text, View } from 'react-native';

import { RegoPicker } from '@/components/RegoPicker';
import { Button, Card, ErrorText, Field, Muted, Row, Screen, Title, Toggle, colors } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { callFunction } from '@/lib/drivers';
import { numOrNull } from '@/lib/format';
import { freshChecklist } from '@/lib/inspection';
import { supabase } from '@/lib/supabase';
import type { InspectionItem } from '@/lib/types';
import { alert } from '@/lib/alert';

function newId(): string {
  // RFC 4122 v4 from Math.random; fine for a storage folder name.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function NewInspection() {
  const params = useLocalSearchParams<{ trip_id?: string; truck?: string; trailer?: string }>();
  const { session } = useAuth();
  const [truck, setTruck] = useState(params.truck ?? '');
  const [trailer, setTrailer] = useState(params.trailer ?? '');
  const [visy, setVisy] = useState('');
  const [hasTrailer, setHasTrailer] = useState(true);
  const [odometer, setOdometer] = useState('');
  const [items, setItems] = useState<InspectionItem[]>(freshChecklist);
  const [safe, setSafe] = useState(true);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setItem = (key: string, patch: Partial<InspectionItem>) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  async function addPhoto(source: 'camera' | 'library') {
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 };
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return alert('Camera permission is needed to take photos.');
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: true, selectionLimit: 10 });
    if (!result.canceled) setPhotos((p) => [...p, ...result.assets.map((a) => a.uri)]);
  }

  async function submit() {
    if (!session) return;
    if (!truck.trim()) return setError('Enter the truck rego.');
    const missingNote = checked.find((it) => !it.ok && !it.note.trim());
    if (missingNote) return setError(`Describe the fault with "${missingNote.label}".`);
    setError(null);
    setBusy(true);
    try {
      const id = newId();
      const paths: string[] = [];
      for (const [i, uri] of photos.entries()) {
        setStatus(`Uploading photo ${i + 1} of ${photos.length}…`);
        const path = `${session.user.id}/${id}/${i + 1}.jpg`;
        const bytes =
          Platform.OS === 'web' ? await (await fetch(uri)).arrayBuffer() : await new File(uri).arrayBuffer();
        const { error } = await supabase.storage
          .from('inspection-photos')
          .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
        if (error) throw new Error(`Photo upload failed: ${error.message}`);
        paths.push(path);
      }

      setStatus('Saving inspection…');
      const { error: insertError } = await supabase.from('inspections').insert({
        id,
        driver_id: session.user.id,
        trip_id: params.trip_id || null,
        truck_rego: truck.trim().toUpperCase(),
        trailer_rego: hasTrailer ? trailer.trim().toUpperCase() || null : null,
        ...(hasTrailer && visy.trim() ? { visy_trailer: visy.trim().toUpperCase() } : {}),
        odometer: numOrNull(odometer),
        items: checked,
        safe_to_drive: safe,
        notes: notes.trim() || null,
        photo_paths: paths,
      });
      if (insertError)
        throw new Error(/visy_trailer|schema cache/i.test(insertError.message) ? `${insertError.message}. The office needs to run the 0019 SQL in Supabase.` : insertError.message);

      setStatus('Emailing the office…');
      try {
        await callFunction('send-inspection', { inspection_id: id });
        alert('Inspection sent', 'The office has been emailed your inspection.');
      } catch (e) {
        // The inspection is saved; the office can still see it in the app.
        alert(
          'Saved, but email failed',
          `Your inspection is saved and the office can see it in the app. (${e instanceof Error ? e.message : e})`,
        );
      }
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  const checked = hasTrailer ? items : items.filter((it) => it.section !== 'trailer');
  const defects = checked.filter((it) => !it.ok).length;

  const checkCard = (it: InspectionItem) => (
    <Card key={it.key}>
      <Row>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '600' }}>{it.label}</Text>
        <Choice label="OK" active={it.ok} color={colors.success} onPress={() => setItem(it.key, { ok: true })} />
        <Choice label="Fault" active={!it.ok} color={colors.danger} onPress={() => setItem(it.key, { ok: false })} />
      </Row>
      {!it.ok && <Field label="What's the fault?" value={it.note} onChangeText={(note) => setItem(it.key, { note })} multiline />}
    </Card>
  );

  return (
    <Screen>
      <RegoPicker kind="truck" label="Truck rego" value={truck} onChange={setTruck} />
      <Field label="Odometer (km)" value={odometer} onChangeText={setOdometer} keyboardType="number-pad" />

      <Title>Truck checks</Title>
      <Muted>Tap "Fault" on anything that needs reporting and describe it.</Muted>
      {items.filter((it) => it.section !== 'trailer').map(checkCard)}

      <Title>Trailer checks</Title>
      <Toggle label="Towing a trailer today" value={hasTrailer} onChange={setHasTrailer} />
      {hasTrailer && (
        <>
          <RegoPicker kind="trailer" label="Trailer rego" value={trailer} onChange={setTrailer} />
          <Field
            label="Visy trailer number (if it's a Visy trailer)"
            value={visy}
            onChangeText={setVisy}
            autoCapitalize="characters"
          />
          {items.filter((it) => it.section === 'trailer').map(checkCard)}
        </>
      )}

      <Title>Photos</Title>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {photos.map((uri, i) => (
          <Pressable key={uri + i} onLongPress={() => setPhotos((p) => p.filter((_, j) => j !== i))}>
            <Image source={{ uri }} style={{ width: 96, height: 96, borderRadius: 8 }} />
          </Pressable>
        ))}
      </View>
      {photos.length > 0 && <Muted>Press and hold a photo to remove it.</Muted>}
      <Row>
        <View style={{ flex: 1 }}>
          <Button title="Take photo" variant="secondary" onPress={() => addPhoto('camera')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="From gallery" variant="secondary" onPress={() => addPhoto('library')} />
        </View>
      </Row>

      <Field label="Other notes" value={notes} onChangeText={setNotes} multiline />
      <Toggle label="Vehicle is safe to drive" value={safe} onChange={setSafe} />
      {defects > 0 && <Text style={{ color: colors.warning }}>{defects} fault(s) will be reported.</Text>}
      <ErrorText>{error}</ErrorText>
      {status && <Muted>{status}</Muted>}
      <Button title="Submit & email office" onPress={submit} busy={busy} />
    </Screen>
  );
}

function Choice({ label, active, color, onPress }: { label: string; active: boolean; color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: active ? color : colors.border,
        backgroundColor: active ? color : colors.card,
      }}
    >
      <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}
