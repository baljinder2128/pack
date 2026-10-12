import { router } from 'expo-router';

import { Button, Card, Muted, Screen, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function MoreScreen() {
  const { profile, isOffice } = useAuth();
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
      <Button title="Sign out" variant="danger" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
