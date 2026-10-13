import { useEffect, useState } from 'react';

import { Field, Select } from '@/components/ui';
import { supabase } from '@/lib/supabase';

type Kind = 'truck' | 'trailer';
const cache: Partial<Record<Kind, string[]>> = {};

/** The office's list of truck or trailer regos (More > Trucks & trailers). Empty if none set up yet. */
export function useRegos(kind: Kind): string[] | null {
  const [regos, setRegos] = useState<string[] | null>(cache[kind] ?? null);
  useEffect(() => {
    supabase
      .from('vehicles')
      .select('rego')
      .eq('kind', kind)
      .eq('active', true)
      .order('rego')
      .then(({ data, error }) => {
        // Before the 0014 SQL is run the table is missing: fall back to typing.
        const list = error ? [] : (data ?? []).map((v) => v.rego as string);
        cache[kind] = list;
        setRegos(list);
      });
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
  const options = regos.map((r) => ({ value: r, label: r }));
  // Keep a rego already on the record (e.g. one since removed) selectable.
  if (value && !regos.includes(value.toUpperCase())) options.unshift({ value, label: value });
  return <Select label={label} value={value} options={options} onChange={onChange} placeholder={`Choose ${kind}…`} />;
}
