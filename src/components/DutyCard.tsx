import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { useAuth } from '@/lib/auth';
import { formatTime } from '@/lib/format';
import { toISODate } from '@/lib/pay';
import { supabase } from '@/lib/supabase';
import { sendCurrentPosition, startTracking, stopTracking } from '@/lib/tracking';
import { Button, Card, ErrorText, Muted, Row, Title, colors } from './ui';
import { alert } from '@/lib/alert';

/** Driver's On duty / Off duty switch. Tracking runs only while on duty. */
export function DutyCard() {
  const { profile, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If the app was reinstalled or permissions reset while on duty, restart tracking.
  useEffect(() => {
    if (profile?.on_duty && profile.tracking_consent_at) startTracking().then(setError);
  }, [profile?.on_duty, profile?.tracking_consent_at]);

  if (!profile) return null;

  async function goOnDuty() {
    if (!profile) return;
    if (!profile.tracking_consent_at) {
      router.push('/tracking-consent');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ on_duty: true, on_duty_since: new Date().toISOString() })
      .eq('id', profile.id);
    if (updateError) {
      setBusy(false);
      return setError(updateError.message);
    }
    const trackError = await startTracking();
    if (trackError) {
      await supabase.from('profiles').update({ on_duty: false }).eq('id', profile.id);
      setError(trackError);
    } else {
      await sendCurrentPosition(profile.id);
    }
    await refreshProfile();
    setBusy(false);
  }

  async function goOffDuty() {
    if (!profile) return;
    setBusy(true);
    const since = profile.on_duty_since;
    await stopTracking();
    await supabase.from('profiles').update({ on_duty: false }).eq('id', profile.id);
    await refreshProfile();
    setBusy(false);
    if (since) {
      const start = new Date(since);
      alert('Off duty', 'Log these hours now?', [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Log hours',
          onPress: () =>
            router.push({
              pathname: '/shift/new',
              params: {
                date: toISODate(start),
                start: formatTime(since),
                end: formatTime(new Date().toISOString()),
              },
            }),
        },
      ]);
    }
  }

  return (
    <Card>
      <Row>
        <Title>{profile.on_duty ? 'On duty' : 'Off duty'}</Title>
        <Text style={{ marginLeft: 'auto', color: profile.on_duty ? colors.success : colors.muted, fontSize: 22 }}>●</Text>
      </Row>
      <Muted>
        {profile.on_duty
          ? `Since ${formatTime(profile.on_duty_since)}. The office can see your location.`
          : 'Your location is not being shared.'}
      </Muted>
      <ErrorText>{error}</ErrorText>
      {profile.on_duty ? (
        <Button title="Go off duty" variant="danger" onPress={goOffDuty} busy={busy} />
      ) : (
        <Button title="Go on duty" variant="success" onPress={goOnDuty} busy={busy} />
      )}
    </Card>
  );
}
