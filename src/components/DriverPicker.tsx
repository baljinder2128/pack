import { Pressable, Text, View } from 'react-native';

import type { Profile } from '@/lib/types';
import { colors, styles } from './ui';

/** Horizontal chip list used by office users to choose which driver a record is for. */
export function DriverPicker({
  drivers,
  value,
  onChange,
  label = 'Driver',
}: {
  drivers: Profile[];
  value: string | null;
  onChange: (id: string) => void;
  label?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {drivers.map((d) => {
          const selected = d.id === value;
          return (
            <Pressable
              key={d.id}
              onPress={() => onChange(d.id)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected ? colors.primary : colors.card,
              }}
            >
              <Text style={{ color: selected ? '#fff' : colors.text }}>{d.full_name || d.email || 'Unnamed'}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
