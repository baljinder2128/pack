import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Text } from 'react-native';

import { Button, Card, ErrorText, Screen, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { sendCurrentPosition, startTracking } from '@/lib/tracking';

const POINTS = [
  'Your location is only tracked while you are On duty. Tap "Go off duty" at any time to stop.',
  'While on duty the app records your position about once a minute, even when the app is in the background. A notification shows while this is happening.',
  'Office staff can see where you are on a map and may share your current location with customers to give delivery updates.',
  'Location history is kept for 90 days and is not used outside SBT Trucking.',
  'You can withdraw consent by speaking to the office. You will not be tracked while off duty.',
];

export default function TrackingConsent() {
  const { profile, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function agree() {
    if (!profile) return;
    setBusy(true);
    setError(null);
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ tracking_consent_at: now, on_duty: true, on_duty_since: now })
      .eq('id', profile.id);
    if (updateError) {
      setBusy(false);
      return setError(updateError.message);
    }
    const trackError = await startTracking();
    if (trackError) {
      await supabase.from('profiles').update({ on_duty: false }).eq('id', profile.id);
      setError(trackError);
      await refreshProfile();
      setBusy(false);
      return;
    }
    await sendCurrentPosition(profile.id);
    await refreshProfile();
    setBusy(false);
    router.back();
  }

  return (
    <Screen>
      <Title>Location tracking while on duty</Title>
      <Card>
        {POINTS.map((p) => (
          <Text key={p} style={{ fontSize: 15, marginBottom: 8 }}>
            • {p}
          </Text>
        ))}
      </Card>
      <Text style={{ fontSize: 15 }}>
        {Platform.OS === 'web'
          ? 'Next your phone will ask for location access. Choose "Allow". On the web app your location is only sent while the app is open on screen, so keep it open in a cradle while you drive.'
          : 'Next your phone will ask for location access. Choose "Allow all the time" (or "Always") so tracking keeps working while you drive.'}
      </Text>
      <ErrorText>{error}</ErrorText>
      <Button title="I agree, go on duty" variant="success" onPress={agree} busy={busy} />
      <Button title="Not now" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
