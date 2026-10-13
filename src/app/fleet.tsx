import { useState } from 'react';
import { Text } from 'react-native';

import { Button, Card, Empty, ErrorText, Field, Loading, Muted, Row, Screen, Segmented, Title, colors } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { unwrap, useFocusQuery } from '@/lib/useQuery';

type Vehicle = { id: string; kind: 'truck' | 'trailer'; rego: string; description: string | null; active: boolean };

/** Office: the trucks and trailers drivers pick from when they enter a rego. */
export default function FleetScreen() {
  const [kind, setKind] = useState<'truck' | 'trailer'>('truck');
  const [rego, setRego] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, loading, error: loadError, reload } = useFocusQuery(
    async () => unwrap(await supabase.from('vehicles').select('*').order('rego')) as Vehicle[],
    [],
  );

  async function add() {
    const r = rego.trim().toUpperCase();
    if (!r) return setError('Enter the rego.');
    setBusy(true);
    setError(null);
    // Re-adding a removed rego brings it back.
    const { error: e } = await supabase
      .from('vehicles')
      .upsert({ kind, rego: r, description: description.trim() || null, active: true }, { onConflict: 'kind,rego' });
    setBusy(false);
    if (e) return setError(e.message);
    setRego('');
    setDescription('');
    reload();
  }

  async function setActive(v: Vehicle, active: boolean) {
    setError(null);
    const { error: e } = await supabase.from('vehicles').update({ active }).eq('id', v.id);
    if (e) setError(e.message);
    reload();
  }

  const list = (data ?? []).filter((v) => v.kind === kind);
  const active = list.filter((v) => v.active);
  const removed = list.filter((v) => !v.active);
  const noun = kind === 'truck' ? 'truck' : 'trailer';

  return (
    <Screen>
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'truck', label: `Trucks${data ? ` (${data.filter((v) => v.kind === 'truck' && v.active).length})` : ''}` },
          { value: 'trailer', label: `Trailers${data ? ` (${data.filter((v) => v.kind === 'trailer' && v.active).length})` : ''}` },
        ]}
      />
      <Card>
        <Title>Add a {noun}</Title>
        <Field label="Rego" value={rego} onChangeText={setRego} autoCapitalize="characters" placeholder="e.g. XQ12AB" />
        <Field label="Description (optional)" value={description} onChangeText={setDescription} placeholder={kind === 'truck' ? 'e.g. Kenworth T610' : 'e.g. 45ft flat top'} />
        <ErrorText>{error}</ErrorText>
        <Button title={`Add ${noun}`} onPress={add} busy={busy} />
      </Card>
      <Muted>Drivers pick from this list when they enter a {noun} rego on trips, pre-trips and runsheets.</Muted>
      <ErrorText>
        {loadError && /vehicles|schema cache/i.test(loadError) ? `${loadError}. Run the 0014 SQL in Supabase first.` : loadError}
      </ErrorText>
      {loading && !data ? (
        <Loading />
      ) : active.length ? (
        active.map((v) => (
          <Card key={v.id}>
            <Row>
              <Title>{v.rego}</Title>
              <Text style={{ marginLeft: 'auto', color: colors.danger, fontWeight: '700' }} onPress={() => setActive(v, false)}>
                Remove
              </Text>
            </Row>
            {v.description && <Muted>{v.description}</Muted>}
          </Card>
        ))
      ) : (
        <Empty>No {noun}s yet. Until you add some, drivers type the rego themselves.</Empty>
      )}
      {removed.length > 0 && (
        <>
          <Muted>Removed (old trips keep these regos):</Muted>
          {removed.map((v) => (
            <Row key={v.id}>
              <Text style={{ color: colors.muted }}>{v.rego}</Text>
              <Text style={{ color: colors.primary, fontWeight: '700' }} onPress={() => setActive(v, true)}>
                Put back
              </Text>
            </Row>
          ))}
        </>
      )}
    </Screen>
  );
}
