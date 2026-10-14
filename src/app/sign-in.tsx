import { useState } from 'react';
import { Image, KeyboardAvoidingView, Linking, Platform, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ErrorText, Field, colors } from '@/components/ui';
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink }}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }} keyboardShouldPersistTaps="handled">
          <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center', gap: 18 }}>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Text style={{ color: '#ffffff', fontSize: 30, fontWeight: '800', letterSpacing: -0.5 }}>
                SBT <Text style={{ color: colors.primary }}>Truckin</Text>
              </Text>
              <Text style={{ color: '#a3a7b3', fontSize: 15 }}>Trips, hours, pre-trips and pay in one place</Text>
            </View>
            <View
              style={{
                backgroundColor: colors.card,
                borderRadius: 22,
                padding: 22,
                gap: 14,
                overflow: 'hidden',
                boxShadow: '0px 20px 50px rgba(0, 0, 0, 0.45)',
              }}
            >
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, backgroundColor: colors.primary }} />
              <Image
                source={require('../../assets/logo.png')}
                style={{ width: 150, height: 94, alignSelf: 'center', marginTop: 6 }}
                resizeMode="contain"
                accessibilityLabel="SBT logo"
              />
              <Text style={{ color: colors.muted, textAlign: 'center' }}>Sign in with the login the office gave you.</Text>
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
            </View>
            {Platform.OS === 'web' && (
              <View style={{ gap: 8, alignItems: 'center' }}>
                <Text
                  style={{ color: '#ffffff', fontWeight: '700', textDecorationLine: 'underline' }}
                  onPress={() => Linking.openURL('https://baljinder2128.github.io/pack/download/sbt-truckin.apk')}
                >
                  Driver? Download the Android app
                </Text>
                <Text style={{ color: '#a3a7b3', textAlign: 'center', fontSize: 13 }}>
                  iPhone: open this page in Safari, tap Share, then "Add to Home Screen" to install SBT Truckin.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
