import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ErrorText, Field, Muted, colors } from '@/components/ui';
import { supabase } from '@/lib/supabase';

// Accounts are created by the office (More > Drivers), so there is no sign-up here.
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message);
    setBusy(false);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 14 }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text }}>SBT Trucking</Text>
          <Text style={{ color: colors.muted }}>Sign in with the login the office gave you.</Text>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
          <ErrorText>{error}</ErrorText>
          <Button title="Sign in" onPress={submit} busy={busy} />
          {Platform.OS === 'web' && (
            <Text
              style={{ color: colors.primary, textAlign: 'center', marginTop: 8 }}
              onPress={() => Linking.openURL('https://baljinder2128.github.io/pack/download/sbt-trucking.apk')}
            >
              Driver? Download the Android app
            </Text>
          )}
          {Platform.OS === 'web' && (
            <Muted>
              iPhone: open this page in Safari, tap Share, then "Add to Home Screen" to install SBT Trucking.
            </Muted>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
