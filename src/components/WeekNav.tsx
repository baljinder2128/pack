import { Pressable, Text, View } from 'react-native';

import { formatDate } from '@/lib/format';
import { addDays, weekEnd } from '@/lib/pay';
import { colors } from './ui';

/** "‹ Mon 12 Oct – Sun 18 Oct ›" selector for Monday-to-Sunday pay weeks. */
export function WeekNav({ start, onChange }: { start: string; onChange: (start: string) => void }) {
  const arrow = (label: string, days: number) => (
    <Pressable onPress={() => onChange(addDays(start, days))} hitSlop={12} style={{ padding: 8 }}>
      <Text style={{ fontSize: 22, color: colors.primary }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      {arrow('‹', -7)}
      <Text style={{ fontWeight: '700', fontSize: 16 }}>
        {formatDate(start)} – {formatDate(weekEnd(start))}
      </Text>
      {arrow('›', 7)}
    </View>
  );
}
