import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { Field, Select, colors } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export type Place = { id: string; name: string; address: string; use_for: 'pickup' | 'dropoff' | 'both' };
let cache: Place[] | null = null;

/** How a place is written on a trip: "Visy Smithfield, 12 Long St". */
export const placeText = (p: Pick<Place, 'name' | 'address'>) => (p.address ? `${p.name}, ${p.address}` : p.name);

/** The office's customer places (More > Customers & places). Empty until some are added (or the 0016 SQL is run). */
export function usePlaces(): Place[] | null {
  const [places, setPlaces] = useState<Place[] | null>(cache);
  useEffect(() => {
    supabase
      .from('places')
      .select('id, name, address, use_for')
      .eq('active', true)
      .order('name')
      .then(({ data, error }) => {
        cache = error ? [] : ((data ?? []) as Place[]);
        setPlaces(cache);
      });
  }, []);
  return places;
}

const OTHER = '__other__';

/** Pick-up or drop-off: a dropdown of the office's places, with "Somewhere else" to type one in. */
export function PlacePicker({
  use,
  label,
  value,
  onChange,
  onPick,
}: {
  use: 'pickup' | 'dropoff';
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Called with the chosen place, e.g. to fill in the customer name. */
  onPick?: (p: Place) => void;
}) {
  const places = usePlaces()?.filter((p) => p.use_for === 'both' || p.use_for === use);
  const [typing, setTyping] = useState(false);
  if (!places?.length || typing)
    return (
      <>
        <Field label={label} value={value} onChangeText={onChange} />
        {typing && (
          <Text style={{ color: colors.primary, fontWeight: '700', marginTop: -6 }} onPress={() => setTyping(false)}>
            Choose from the list instead
          </Text>
        )}
      </>
    );
  const options = places.map((p) => ({ value: placeText(p), label: placeText(p) }));
  if (value && !options.some((o) => o.value === value)) options.unshift({ value, label: value });
  options.push({ value: OTHER, label: 'Somewhere else (type it in)…' });
  return (
    <Select
      label={label}
      value={value}
      options={options}
      placeholder={`Choose ${use === 'pickup' ? 'pick-up' : 'drop-off'} place…`}
      onChange={(v) => {
        if (v === OTHER) {
          setTyping(true);
          onChange('');
          return;
        }
        onChange(v);
        const p = places.find((x) => placeText(x) === v);
        if (p) onPick?.(p);
      }}
    />
  );
}

/** Customer: a dropdown of the customer names on the office's places, with "Someone else" to type one in. */
export function CustomerPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const names = [...new Set((usePlaces() ?? []).map((p) => p.name))];
  const [typing, setTyping] = useState(false);
  if (!names.length || typing)
    return (
      <>
        <Field label="Customer" value={value} onChangeText={onChange} />
        {typing && (
          <Text style={{ color: colors.primary, fontWeight: '700', marginTop: -6 }} onPress={() => setTyping(false)}>
            Choose from the list instead
          </Text>
        )}
      </>
    );
  const options = names.map((n) => ({ value: n, label: n }));
  if (value && !names.includes(value)) options.unshift({ value, label: value });
  options.push({ value: OTHER, label: 'Someone else (type it in)…' });
  return (
    <Select
      label="Customer"
      value={value}
      options={options}
      placeholder="Choose customer…"
      onChange={(v) => {
        if (v === OTHER) {
          setTyping(true);
          onChange('');
        } else onChange(v);
      }}
    />
  );
}
