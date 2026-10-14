import { useState } from 'react';
import { Text } from 'react-native';

import { Button, Card, Empty, ErrorText, Field, Loading, Muted, Row, Screen, Segmented, Title, colors } from '@/components/ui';
import type { Place } from '@/components/PlacePicker';
import { supabase } from '@/lib/supabase';
import { unwrap, useFocusQuery } from '@/lib/useQuery';

type Row_ = Place & { active: boolean };
const useLabel = { both: 'Pick-up & drop-off', pickup: 'Pick-up only', dropoff: 'Drop-off only' } as const;

/** Office: customer pick-up and drop-off places that drivers choose from on a trip. */
export default function PlacesScreen() {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [useFor, setUseFor] = useState<Place['use_for']>('both');
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, loading, error: loadError, reload } = useFocusQuery(
    async () => unwrap(await supabase.from('places').select('*').order('name')) as Row_[],
    [],
  );

  async function add() {
    if (!name.trim()) return setError('Enter the customer or place name.');
    setBusy(true);
    setError(null);
    const row = { name: name.trim(), address: address.trim(), use_for: useFor, active: true };
    // Adding the same name and address again updates it (and brings back a removed one).
    const { error: e } = editing
      ? await supabase.from('places').update(row).eq('id', editing)
      : await supabase.from('places').upsert(row, { onConflict: 'name,address' });
    setBusy(false);
    if (e) return setError(/duplicate|unique/i.test(e.message) ? 'That customer and address is already in the list.' : e.message);
    clear();
    reload();
  }

  function clear() {
    setEditing(null);
    setName('');
    setAddress('');
    setUseFor('both');
    setError(null);
  }

  function startEdit(p: Row_) {
    setEditing(p.id);
    setName(p.name);
    setAddress(p.address);
    setUseFor(p.use_for);
    setError(null);
  }

  async function setActive(p: Row_, active: boolean) {
    setError(null);
    const { error: e } = await supabase.from('places').update({ active }).eq('id', p.id);
    if (e) setError(e.message);
    reload();
  }

  const active = (data ?? []).filter((p) => p.active);
  const removed = (data ?? []).filter((p) => !p.active);

  return (
    <Screen>
      <Card>
        <Title>{editing ? 'Edit customer place' : 'Add a customer place'}</Title>
        <Field label="Customer / place name" value={name} onChangeText={setName} placeholder="e.g. Visy Smithfield" />
        <Field label="Address" value={address} onChangeText={setAddress} placeholder="e.g. 12 Long St, Smithfield NSW" />
        <Segmented
          value={useFor}
          onChange={setUseFor}
          options={[
            { value: 'both', label: 'Both' },
            { value: 'pickup', label: 'Pick-up' },
            { value: 'dropoff', label: 'Drop-off' },
          ]}
        />
        <ErrorText>{error}</ErrorText>
        <Button title={editing ? 'Save changes' : 'Add place'} onPress={add} busy={busy} />
        {editing && (
          <Text style={{ color: colors.primary, fontWeight: '700', textAlign: 'center' }} onPress={clear}>
            Cancel
          </Text>
        )}
      </Card>
      <Muted>
        Drivers choose the customer, pick-up and drop-off from these on a trip. They can still type one that isn't listed. Changing a place
        here doesn't change trips already saved.
      </Muted>
      <ErrorText>
        {loadError && /places|schema cache/i.test(loadError) ? `${loadError}. Run the 0016 SQL in Supabase first.` : loadError}
      </ErrorText>
      {loading && !data ? (
        <Loading />
      ) : active.length ? (
        active.map((p) => (
          <Card key={p.id}>
            <Row>
              <Title>{p.name}</Title>
              <Text style={{ marginLeft: 'auto', color: colors.primary, fontWeight: '700' }} onPress={() => startEdit(p)}>
                Edit
              </Text>
              <Text style={{ color: colors.danger, fontWeight: '700' }} onPress={() => setActive(p, false)}>
                Remove
              </Text>
            </Row>
            <Muted>{[p.address, useLabel[p.use_for]].filter(Boolean).join(' · ')}</Muted>
          </Card>
        ))
      ) : (
        <Empty>No places yet. Until you add some, drivers type the pick-up and drop-off themselves.</Empty>
      )}
      {removed.length > 0 && (
        <>
          <Muted>Removed:</Muted>
          {removed.map((p) => (
            <Row key={p.id}>
              <Text style={{ color: colors.muted }}>{p.name}</Text>
              <Text style={{ color: colors.primary, fontWeight: '700' }} onPress={() => setActive(p, true)}>
                Put back
              </Text>
            </Row>
          ))}
        </>
      )}
    </Screen>
  );
}
