import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from './supabase';
import type { Profile } from './types';

export async function listDrivers({ includeRemoved = false } = {}): Promise<Profile[]> {
  let q = supabase.from('profiles').select('*').order('full_name');
  if (!includeRemoved) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Profile[];
}

/** Calls an edge function and turns its JSON `{ error }` into a thrown Error. */
export async function callFunction<T = { ok: true }>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response;
      const text = await res.text().catch(() => '');
      let message: string | undefined;
      try {
        message = JSON.parse(text)?.error ?? JSON.parse(text)?.message ?? JSON.parse(text)?.msg;
      } catch {
        message = text || undefined;
      }
      if (res.status === 404 && !message?.length) message = `The "${name}" function isn't deployed in Supabase yet.`;
      throw new Error(`${message ?? error.message} (${name}, ${res.status})`);
    }
    throw new Error(`${error.message} (${name})`);
  }
  return data as T;
}
