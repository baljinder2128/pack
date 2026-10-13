import Ionicons from '@expo/vector-icons/Ionicons';
import Tabs from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { Image, Text, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/components/ui';
import { useAuth } from '@/lib/auth';

type IconName = ComponentProps<typeof Ionicons>['name'];

function icon(name: IconName, active: IconName) {
  return ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Ionicons name={focused ? active : name} size={24} color={color as string} />
  );
}

/** Screen title with the SBT logo beside it. */
function BrandTitle({ children }: { children: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Image source={require('../../../assets/logo.png')} style={{ width: 40, height: 25 }} resizeMode="contain" />
      <View style={{ width: 1, height: 22, backgroundColor: colors.border }} />
      <Text style={{ fontSize: 19, fontWeight: '800', color: colors.text, letterSpacing: -0.3 }}>{children}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { isOffice } = useAuth();
  // Keep the icons and labels clear of the phone's bottom edge and home bar.
  const { bottom } = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#8a8f9c',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', lineHeight: 14, marginTop: 2, flexShrink: 0 },
        tabBarStyle: {
          borderTopColor: colors.border,
          backgroundColor: colors.card,
          height: 72 + bottom,
          paddingTop: 6,
          paddingBottom: bottom + 8,
        },
        tabBarItemStyle: { paddingVertical: 4 },
        headerTitleAlign: 'left',
        headerTitle: ({ children }) => <BrandTitle>{children}</BrandTitle>,
        headerStyle: { backgroundColor: colors.card, borderBottomWidth: 3, borderBottomColor: colors.primary },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Trips', tabBarLabel: 'Trips', tabBarIcon: icon('bus-outline', 'bus') }} />
      <Tabs.Screen name="hours" options={{ title: 'Hours', tabBarIcon: icon('time-outline', 'time') }} />
      <Tabs.Screen
        name="inspections"
        options={{ title: 'Pre-trip', tabBarIcon: icon('shield-checkmark-outline', 'shield-checkmark') }}
      />
      <Tabs.Screen
        name="rcti"
        options={{ title: isOffice ? 'Pay' : 'My pay', tabBarIcon: icon('wallet-outline', 'wallet') }}
      />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('menu-outline', 'menu') }} />
    </Tabs>
  );
}
