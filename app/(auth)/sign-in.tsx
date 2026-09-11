import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ErrorNote, Field } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors, space, type } from '@/lib/theme';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (signInError) setError(signInError.message);
    // On success the auth listener in SessionProvider takes over navigation.
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <Text style={[type.display, { color: colors.text }]}>Pantry to Plate</Text>
            <Text style={[type.body, { color: colors.textMuted }]}>
              Cook what you already have.
            </Text>
          </View>

          <View style={s.form}>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              placeholder="Your password"
              onSubmitEditing={submit}
              returnKeyType="go"
            />

            {error ? <ErrorNote message={error} /> : null}

            <Button title="Sign in" onPress={submit} loading={busy} />

            <Link href="/(auth)/sign-up" style={s.link}>
              <Text style={[type.small, { color: colors.primary }]}>
                No account yet? Create one
              </Text>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: space.xl, gap: space.xxl },
  header: { gap: space.xs },
  form: { gap: space.lg },
  link: { alignSelf: 'center', paddingVertical: space.sm },
});
