import { router } from 'expo-router';
import { Linking, Platform } from 'react-native';

import { Button, Card, Muted, Screen, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { alert } from '@/lib/alert';
import { supabase } from '@/lib/supabase';
import { stopTracking } from '@/lib/tracking';

export default function MoreScreen() {
  const { profile, isOffice } = useAuth();

  // Signing out stops location, so a driver on duty must go off duty first;
  // otherwise the office would think they are still on the road.
  function signOut() {
    if (!profile?.on_duty) return supabase.auth.signOut();
    alert('You are on duty', 'Signing out stops sharing your location with the office. Go off duty and sign out?', [
      { text: 'Stay signed in', style: 'cancel' },
      {
        text: 'Go off duty & sign out',
        style: 'destructive',
        onPress: async () => {
          await stopTracking();
          await supabase.from('profiles').update({ on_duty: false }).eq('id', profile.id);
          await supabase.auth.signOut();
        },
      },
    ]);
  }
  return (
    <Screen>
      <Card>
        <Title>{profile?.full_name || 'My account'}</Title>
        <Muted>
          {profile?.email} · {isOffice ? 'Office' : 'Driver'}
        </Muted>
      </Card>
      <Button title="My details" variant="secondary" onPress={() => router.push('/profile')} />
      {isOffice && (
        <>
          <Button title="Drivers & logins" variant="secondary" onPress={() => router.push('/drivers')} />
          <Button title="Company details (for RCTI)" variant="secondary" onPress={() => router.push('/company')} />
        </>
      )}
      {Platform.OS === 'web' && (
        <Button
          title="Download the Android app"
          variant="secondary"
          onPress={() => Linking.openURL('https://baljinder2128.github.io/pack/download/sbt-truckin.apk')}
        />
      )}
      <Button title="Sign out" variant="danger" onPress={signOut} />
    </Screen>
  );
}
