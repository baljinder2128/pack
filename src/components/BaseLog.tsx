import { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';

import { alert } from '@/lib/alert';
import { supabase } from '@/lib/supabase';
import { Button, ErrorText, Field, Muted, Row, Title, colors } from './ui';

export type Base = {
  id: string;
  driver_id: string;
  kind: 'night_load' | 'rail';
  base_id: string;
  load_number: string | null;
  docket_number: string | null;
  trip_id: string | null;
  created_at: string;
};

/** "ifru 1234567" -> "IFRU1234567". */
export const cleanBaseId = (v: string) => v.toUpperCase().replace(/\s+/g, '');
export const isBaseId = (v: string) => /^IFRU\d{7}$/.test(cleanBaseId(v));

/**
 * Bases a driver logs: on night shift, each base loaded (load number + base ID);
 * on a trip, rail bases taken to Pacific National (base ID + docket number).
 * Base IDs are IFRU followed by exactly 7 digits.
 */
export function BaseLog({
  kind,
  driverId,
  since,
  tripId,
}: {
  kind: Base['kind'];
  driverId: string;
  /** Night shift: list bases logged since the driver went on duty. */
  since?: string | null;
  /** Rail: the trip these bases belong to. */
  tripId?: string;
}) {
  const night = kind === 'night_load';
  const [ref, setRef] = useState('');
  const [baseId, setBaseId] = useState('');
  const [bases, setBases] = useState<Base[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    let q = supabase.from('bases').select('*').eq('kind', kind).order('created_at');
    q = tripId ? q.eq('trip_id', tripId) : q.eq('driver_id', driverId).gte('created_at', since ?? new Date().toISOString());
    const { data, error: e } = await q;
    if (e) setError(/bases|schema cache/i.test(e.message) ? `${e.message}. The office needs to run the 0018 SQL in Supabase.` : e.message);
    else setBases((data ?? []) as Base[]);
  }, [kind, driverId, since, tripId]);
  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    const id = cleanBaseId(baseId);
    if (!ref.trim()) return setError(night ? 'Enter the load number.' : 'Enter the docket number.');
    if (!isBaseId(id)) return setError('Base ID must be IFRU followed by 7 digits, like IFRU1234567.');
    if (bases.some((b) => b.base_id === id)) return setError(`${id} is already on the list.`);
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.from('bases').insert({
      driver_id: driverId,
      kind,
      base_id: id,
      trip_id: tripId ?? null,
      ...(night ? { load_number: ref.trim() } : { docket_number: ref.trim() }),
    });
    setBusy(false);
    if (e) return setError(e.message);
    setRef('');
    setBaseId('');
    load();
  }

  function remove(b: Base) {
    alert(`Remove ${b.base_id}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const { error: e } = await supabase.from('bases').delete().eq('id', b.id);
          if (e) setError(e.message);
          load();
        },
      },
    ]);
  }

  return (
    <>
      <Title>
        {night ? 'Bases loaded tonight' : 'Rail bases to Pacific National'}: {bases.length}
      </Title>
      {bases.map((b) => (
        <Row key={b.id}>
          <Text style={{ fontWeight: '700' }}>{b.base_id}</Text>
          <Muted>{night ? `Load ${b.load_number}` : `Docket ${b.docket_number}`}</Muted>
          <Text style={{ marginLeft: 'auto', color: colors.danger, fontWeight: '700' }} onPress={() => remove(b)}>
            Remove
          </Text>
        </Row>
      ))}
      <Field
        label={night ? 'Load number' : 'Docket number'}
        value={ref}
        onChangeText={setRef}
        autoCapitalize="characters"
      />
      <Field
        label="Base ID (IFRU + 7 digits)"
        value={baseId}
        onChangeText={(v) => setBaseId(cleanBaseId(v).slice(0, 11))}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="IFRU1234567"
        maxLength={11}
      />
      <ErrorText>{error}</ErrorText>
      <Button title={night ? 'Add loaded base' : 'Add rail base'} variant="secondary" onPress={add} busy={busy} />
    </>
  );
}
