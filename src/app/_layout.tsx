import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';

import { Loading, colors } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { isConfigured } from '@/lib/supabase';
// Registers the background location task at startup.
import '@/lib/tracking';

// If a screen crashes, show the error and a Retry button instead of a blank page.
export { ErrorBoundary } from 'expo-router';

function RootStack() {
  const { session, loading } = useAuth();
  if (loading) return <Loading />;
  const signedIn = Boolean(session);
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerTitleStyle: { fontWeight: '800', color: colors.text },
        headerStyle: { backgroundColor: colors.card },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="trip/new" options={{ title: 'New trip', presentation: 'modal' }} />
        <Stack.Screen name="trip/[id]" options={{ title: 'Trip' }} />
        <Stack.Screen name="runsheet/new" options={{ title: 'Submit runsheet', presentation: 'modal' }} />
        <Stack.Screen name="runsheet/[id]" options={{ title: 'Runsheet' }} />
        <Stack.Screen name="fuel" options={{ title: 'Fuel dockets' }} />
        <Stack.Screen name="shift/new" options={{ title: 'Log hours', presentation: 'modal' }} />
        <Stack.Screen name="inspection/new" options={{ title: 'Pre-trip inspection' }} />
        <Stack.Screen name="inspection/[id]" options={{ title: 'Inspection' }} />
        <Stack.Screen name="drivers" options={{ title: 'Drivers' }} />
        <Stack.Screen name="driver/[id]" options={{ title: 'Driver' }} />
        <Stack.Screen name="company" options={{ title: 'Company details' }} />
        <Stack.Screen name="licence-renewal" options={{ title: 'Renewed licence', presentation: 'modal' }} />
        <Stack.Screen name="profile" options={{ title: 'My details' }} />
        <Stack.Screen name="tracking-consent" options={{ title: 'Location consent', presentation: 'modal' }} />
        <Stack.Screen name="live-map" options={{ title: 'Live map' }} />
        <Stack.Screen name="route-history" options={{ title: 'Past routes' }} />
        <Stack.Screen name="rcti-archive" options={{ title: 'Pay archive' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  if (!isConfigured) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 16 }}>
          Supabase is not configured. Copy .env.example to .env.local, fill in EXPO_PUBLIC_SUPABASE_URL and
          EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart the app.
        </Text>
      </View>
    );
  }
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      {/* On a wide screen (the Windows/web version) keep the app a readable width. */}
      <View style={{ flex: 1, backgroundColor: '#dfe1e6' }}>
        <View style={{ flex: 1, width: '100%', maxWidth: 960, alignSelf: 'center' }}>
          <RootStack />
        </View>
      </View>
    </AuthProvider>
  );
}
