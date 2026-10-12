import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

/** Runs `load` whenever the screen comes into focus; exposes a manual reload. */
export function useFocusQuery<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(async () => {
    setLoading(true);
    try {
      setData(await load());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, deps);

  useFocusEffect(
    useCallback(() => {
      run();
    }, [run]),
  );

  return { data, loading, error, reload: run };
}

/** Throws the Supabase error so useFocusQuery can show it. */
export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
