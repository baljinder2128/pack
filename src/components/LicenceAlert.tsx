import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Button, colors, styles } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { daysToExpiry } from '@/lib/licence';

/** Driver home: a reminder from a week before their licence expires until they send the renewed one. */
export function LicenceAlert() {
  const { profile } = useAuth();
  const days = daysToExpiry(profile?.licence_expiry ?? null);
  if (days === null || days > 7 || !profile?.licence_expiry) return null;
  const expired = days < 0;
  const tint = expired || days === 0 ? colors.danger : colors.warning;
  return (
    <View style={[styles.card, { borderColor: tint, borderWidth: 2 }]}>
      <Text style={{ color: tint, fontWeight: '800', fontSize: 17 }}>
        {expired ? 'Your licence has expired' : days === 0 ? 'Your licence expires today' : `Your licence expires in ${days} day${days === 1 ? '' : 's'}`}
      </Text>
      <Text style={{ color: colors.text }}>
        Expiry on file: {formatDate(profile.licence_expiry)}. Renew it, then send a photo of the new licence to the office.
      </Text>
      <Button title="Send renewed licence" onPress={() => router.push('/licence-renewal')} />
    </View>
  );
}
