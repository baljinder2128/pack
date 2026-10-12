import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

export const colors = {
  bg: '#f4f5f7',
  card: '#ffffff',
  text: '#111827',
  muted: '#6b7280',
  border: '#e5e7eb',
  primary: '#1d4ed8',
  danger: '#b91c1c',
  success: '#15803d',
  warning: '#b45309',
};

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  if (!scroll) return <View style={styles.screen}>{children}</View>;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Card({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={styles.card}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  busy = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  busy?: boolean;
  disabled?: boolean;
}) {
  const bg = {
    primary: colors.primary,
    secondary: colors.card,
    danger: colors.danger,
    success: colors.success,
  }[variant];
  const fg = variant === 'secondary' ? colors.primary : '#fff';
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: pressed || disabled ? 0.6 : 1 },
        variant === 'secondary' && { borderWidth: 1, borderColor: colors.primary },
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={[styles.input, props.multiline && { minHeight: 80 }]} {...props} />
    </View>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={[styles.row, styles.field, { justifyContent: 'space-between' }]}>
      <Text style={styles.label}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

export function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color + '1a' }]}>
      <Text style={{ color, fontWeight: '600', fontSize: 12 }}>{label}</Text>
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          style={[styles.segment, o.value === value && { backgroundColor: colors.primary }]}
        >
          <Text style={{ color: o.value === value ? '#fff' : colors.text, fontWeight: '600' }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ padding: 32 }}>
      <ActivityIndicator />
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <Text style={{ color: colors.danger, marginVertical: 8 }}>{children}</Text>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <Text style={[styles.muted, { textAlign: 'center', padding: 24 }]}>{children}</Text>;
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenContent: { padding: 16, paddingBottom: 48, gap: 12 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, gap: 4, borderWidth: 1, borderColor: colors.border },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  muted: { color: colors.muted, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  button: { borderRadius: 10, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '700' },
  field: { gap: 4 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, alignSelf: 'flex-start' },
  segmented: { flexDirection: 'row', backgroundColor: colors.border, borderRadius: 10, padding: 3, gap: 3 },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
});
