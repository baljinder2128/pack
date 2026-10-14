import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

// SBT brand: black and red, from the logo.
export const colors = {
  bg: '#f1f2f4',
  card: '#ffffff',
  text: '#111318',
  muted: '#6b7080',
  border: '#e4e6ea',
  primary: '#d7141a',
  primaryDark: '#a90f14',
  ink: '#15171c',
  inkSoft: '#2a2d35',
  danger: '#c0262d',
  success: '#15803d',
  warning: '#b45309',
};

const shadow = '0px 1px 2px rgba(17, 19, 24, 0.06), 0px 6px 16px rgba(17, 19, 24, 0.06)';

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
    danger: colors.card,
    success: colors.success,
  }[variant];
  const fg = variant === 'secondary' ? colors.ink : variant === 'danger' ? colors.danger : '#fff';
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        (variant === 'primary' || variant === 'success') && { boxShadow: `0px 4px 12px ${bg}40` },
        variant === 'secondary' && { borderWidth: 1, borderColor: colors.border, boxShadow: shadow },
        variant === 'danger' && { borderWidth: 1.5, borderColor: colors.danger },
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

/** A dropdown: tap to open a list and pick one option. */
export function Select({
  label,
  value,
  options,
  onChange,
  placeholder = 'Choose…',
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={[styles.input, { flexDirection: 'row', alignItems: 'center' }]}
      >
        <Text style={{ flex: 1, fontSize: 16, color: current || value ? colors.text : colors.muted }}>
          {current?.label ?? (value || placeholder)}
        </Text>
        <Text style={{ color: colors.muted }}>▼</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}
        >
          <View style={{ backgroundColor: colors.card, borderRadius: 12, maxHeight: '80%', width: '100%', maxWidth: 420, alignSelf: 'center' }}>
            <Text style={{ fontSize: 17, fontWeight: '700', padding: 16, color: colors.text }}>{label}</Text>
            <ScrollView>
              {[{ value: '', label: 'None' }, ...options].map((o) => (
                <Pressable
                  key={o.value || 'none'}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    backgroundColor: o.value === value ? colors.primary + '14' : undefined,
                  }}
                >
                  <Text style={{ fontSize: 16, color: o.value ? colors.text : colors.muted, fontWeight: o.value === value ? '700' : '400' }}>
                    {o.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
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
          style={[styles.segment, o.value === value && { backgroundColor: colors.card, boxShadow: shadow }]}
        >
          <Text style={{ color: o.value === value ? colors.primary : colors.muted, fontWeight: '700' }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** A dark headline card for the number that matters most on a screen (pay, hours). */
export function Hero({
  label,
  value,
  sub,
  children,
}: {
  label: string;
  value: string;
  sub?: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroStripe} />
      <Text style={styles.heroLabel}>{label}</Text>
      <Text style={styles.heroValue}>{value}</Text>
      {sub ? <Text style={styles.heroSub}>{sub}</Text> : null}
      {children}
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
  screenContent: { padding: 16, paddingBottom: 48, gap: 14 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: '#eceef1',
    boxShadow: shadow,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  button: { borderRadius: 14, paddingVertical: 15, paddingHorizontal: 18, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '700', color: colors.inkSoft },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  segmented: { flexDirection: 'row', backgroundColor: '#e4e6ea', borderRadius: 12, padding: 4, gap: 4 },
  segment: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  hero: {
    backgroundColor: colors.ink,
    borderRadius: 18,
    padding: 18,
    paddingTop: 22,
    gap: 4,
    overflow: 'hidden',
    boxShadow: '0px 8px 24px rgba(17, 19, 24, 0.25)',
  },
  heroStripe: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: colors.primary },
  heroLabel: { color: '#a3a7b3', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  heroValue: { color: '#ffffff', fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  heroSub: { color: '#d4d6dc', fontSize: 14 },
});
