import { useEffect, useState } from 'react';

import { Field, Select } from '@/components/ui';
import { supabase } from '@/lib/supabase';

type Kind = 'truck' | 'trailer';
type Vehicle = { rego: string; fleet_number: string | null };
const cache: Partial<Record<Kind, Vehicle[]>> = {};

/** The office's trucks or trailers (More > Trucks & trailers). Empty if none set up yet. */
export function useRegos(kind: Kind): Vehicle[] | null {
  const [regos, setRegos] = useState<Vehicle[] | null>(cache[kind] ?? null);
  useEffect(() => {
    const load = (cols: string) =>
      supabase.from('vehicles').select(cols).eq('kind', kind).eq('active', true).order('rego');
    (async () => {
      // fleet_number needs the 0015 SQL; before the 0014 SQL there is no table: fall back to typing.
      let { data, error } = await load('rego, fleet_number');
      if (error) ({ data, error } = await load('rego'));
      const list = error ? [] : ((data ?? []) as unknown as Vehicle[]).map((v) => ({ rego: v.rego, fleet_number: v.fleet_number ?? null }));
      // Fleet number order (natural, so 9 comes before 10), regos without one last.
      list.sort((a, b) =>
        a.fleet_number && b.fleet_number
          ? a.fleet_number.localeCompare(b.fleet_number, undefined, { numeric: true })
          : a.fleet_number ? -1 : b.fleet_number ? 1 : a.rego.localeCompare(b.rego),
      );
      cache[kind] = list;
      setRegos(list);
    })();
  }, [kind]);
  return regos;
}

/** A dropdown of the office's regos; a plain text box until the office has added some. */
export function RegoPicker({
  kind,
  label,
  value,
  onChange,
}: {
  kind: Kind;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const regos = useRegos(kind);
  if (!regos?.length) return <Field label={label} value={value} onChangeText={onChange} autoCapitalize="characters" />;
  // Pick by fleet number; the rego is what gets saved.
  const options = regos.map((r) => ({ value: r.rego, label: r.fleet_number ? `Fleet ${r.fleet_number} · ${r.rego}` : r.rego }));
  // Keep a rego already on the record (e.g. one since removed) selectable.
  if (value && !regos.some((r) => r.rego === value.toUpperCase())) options.unshift({ value, label: value });
  const hasFleet = regos.some((r) => r.fleet_number);
  return (
    <Select
      label={hasFleet ? `${label} (pick the fleet number)` : label}
      value={value}
      options={options}
      onChange={onChange}
      placeholder={hasFleet ? `Choose ${kind} fleet number…` : `Choose ${kind}…`}
    />
  );
}
