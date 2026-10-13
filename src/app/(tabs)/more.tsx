import { router } from 'expo-router';
import { Linking, Platform, Text, View } from 'react-native';

import { MenuList, type MenuItem } from '@/components/MenuList';
import { Screen, colors, styles } from '@/components/ui';
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
  const initials = (profile?.full_name || profile?.email || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <Screen>
      <View style={[styles.hero, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
        <View style={styles.heroStripe} />
        <View
          style={{
            width: 54,
            height: 54,
            borderRadius: 27,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{initials}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: '#fff', fontSize: 19, fontWeight: '800' }}>{profile?.full_name || 'My account'}</Text>
          <Text style={{ color: '#a3a7b3' }}>{profile?.email}</Text>
          <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12, letterSpacing: 0.8 }}>
            {isOffice ? 'OFFICE' : 'DRIVER'}
          </Text>
        </View>
      </View>
      <MenuList
        items={[
          {
            icon: 'water-outline',
            label: 'Fuel dockets',
            hint: isOffice ? 'Fuel receipts drivers have sent' : 'Send a photo of a fuel receipt to the office',
            onPress: () => router.push('/fuel'),
          },
          { icon: 'person-circle-outline', label: 'My details', hint: 'Name, phone, ABN and password', onPress: () => router.push('/profile') },
          ...(!isOffice
            ? ([
                { icon: 'card-outline', label: 'Renewed licence', hint: 'Send a photo of your new licence to the office', onPress: () => router.push('/licence-renewal') },
              ] as MenuItem[])
            : []),
          ...(isOffice
            ? ([
                { icon: 'people-outline', label: 'Drivers & logins', hint: 'Add drivers, pay rates and office staff', onPress: () => router.push('/drivers') },
                { icon: 'map-outline', label: 'Live map', hint: 'Drivers on duty now and past routes', onPress: () => router.push('/live-map') },
                { icon: 'bus-outline', label: 'Trucks & trailers', hint: 'Regos drivers pick from', onPress: () => router.push('/fleet') },
                { icon: 'business-outline', label: 'Company details', hint: 'Shown on RCTIs and payslips', onPress: () => router.push('/company') },
              ] as MenuItem[])
            : []),
          ...(Platform.OS === 'web'
            ? ([
                {
                  icon: 'logo-android',
                  label: 'Download the Android app',
                  onPress: () => Linking.openURL('https://baljinder2128.github.io/pack/download/sbt-truckin.apk'),
                },
              ] as MenuItem[])
            : []),
        ]}
      />
      <MenuList items={[{ icon: 'log-out-outline', label: 'Sign out', tone: 'danger', onPress: signOut }]} />
    </Screen>
  );
}
