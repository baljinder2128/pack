import Tabs from 'expo-router/js-tabs';
import { Text, type ColorValue } from 'react-native';

import { colors } from '@/components/ui';
import { useAuth } from '@/lib/auth';

function icon(glyph: string) {
  return ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
}

export default function TabsLayout() {
  const { isOffice } = useAuth();
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.primary, headerTintColor: colors.text }}>
      <Tabs.Screen name="index" options={{ title: 'Trips', tabBarIcon: icon('🚚') }} />
      <Tabs.Screen name="hours" options={{ title: 'Hours', tabBarIcon: icon('⏱') }} />
      <Tabs.Screen name="inspections" options={{ title: 'Pre-trip', tabBarIcon: icon('✅') }} />
      <Tabs.Screen name="rcti" options={{ title: isOffice ? 'Pay' : 'My pay', tabBarIcon: icon('🧾') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('☰') }} />
    </Tabs>
  );
}
