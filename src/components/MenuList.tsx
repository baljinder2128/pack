import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';

import { colors, styles } from '@/components/ui';

export type MenuItem = {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  hint?: string;
  onPress: () => void;
  tone?: 'danger';
};

/** A card of tappable rows with an icon, like a phone's settings screen. */
export function MenuList({ items }: { items: MenuItem[] }) {
  return (
    <View style={[styles.card, { padding: 0, gap: 0, overflow: 'hidden' }]}>
      {items.map((item, i) => {
        const tint = item.tone === 'danger' ? colors.danger : colors.primary;
        return (
          <Pressable
            key={item.label}
            onPress={item.onPress}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderTopWidth: i ? 1 : 0,
              borderTopColor: colors.border,
              backgroundColor: pressed ? '#f6f7f9' : colors.card,
            })}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                backgroundColor: tint + '14',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={item.icon} size={20} color={tint} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: item.tone === 'danger' ? colors.danger : colors.text }}>
                {item.label}
              </Text>
              {item.hint ? <Text style={{ color: colors.muted, fontSize: 13 }}>{item.hint}</Text> : null}
            </View>
            {item.tone !== 'danger' && <Ionicons name="chevron-forward" size={18} color="#b4b8c2" />}
          </Pressable>
        );
      })}
    </View>
  );
}
