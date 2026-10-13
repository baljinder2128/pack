import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Text } from 'react-native';

import { formatTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { Card, Title, colors } from './ui';

// A driver on duty is expected to send a position about once a minute.
export const STALE_MS = 5 * 60 * 1000;

type Missing = { id: string; full_name: string; phone: string | null; last: string | null };

/** On-duty drivers whose location hasn't come through recently, refreshed every minute. */
export function useMissingDrivers(): Missing[] {
  const [missing, setMissing] = useState<Missing[]>([]);
  useEffect(() => {
    let alive = true;
    async function load() {
      const [{ data: onDuty }, { data: live }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, phone').eq('role', 'driver').eq('active', true).eq('on_duty', true),
        supabase.from('live_drivers').select('driver_id, recorded_at'),
      ]);
      if (!alive || !onDuty) return;
      const lastSeen = new Map((live ?? []).map((l) => [l.driver_id as string, l.recorded_at as string]));
      setMissing(
        onDuty
          .map((d) => ({ ...d, last: lastSeen.get(d.id) ?? null }))
          .filter((d) => !d.last || Date.now() - new Date(d.last).getTime() > STALE_MS),
      );
    }
    load();
    const timer = setInterval(load, 60 * 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return missing;
}

/** Office banner: drivers who are on duty but the office can't see. */
export function SignalWarning({ showMapLink = true }: { showMapLink?: boolean }) {
  const missing = useMissingDrivers();
  if (missing.length === 0) return null;
  return (
    <Card>
      <Title>
        {missing.length === 1 ? '1 driver on duty is' : `${missing.length} drivers on duty are`} not sharing location
      </Title>
      {missing.map((d) => (
        <Text key={d.id} style={{ color: colors.danger, fontSize: 15 }}>
          {d.full_name}: {d.last ? `last seen ${formatTime(d.last)}` : 'no location yet'}
          {d.phone ? (
            <Text style={{ color: colors.primary }} onPress={() => Linking.openURL(`tel:${d.phone}`)}>
              {'  '}Call
            </Text>
          ) : null}
        </Text>
      ))}
      <Text style={{ color: colors.muted }}>
        Their app may be closed, the phone locked (iPhone), signed out, or out of signal.
      </Text>
      {showMapLink && (
        <Text style={{ color: colors.primary }} onPress={() => router.push('/live-map')}>
          Open live map
        </Text>
      )}
    </Card>
  );
}
