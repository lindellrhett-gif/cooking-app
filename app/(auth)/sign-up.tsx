import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ErrorNote, Field } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors, space, type } from '@/lib/theme';

export default function SignUp() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setNotice(null);

    if (password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }

    setBusy(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      // A database trigger reads this to create the profile row.
      options: { data: { display_name: displayName.trim() } },
    });
    setBusy(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    // With email confirmation switched on in Supabase, sign-up succeeds but no
    // session is returned. Saying so beats a screen that appears to do nothing.
    if (!data.session) {
      setNotice('Check your email for a confirmation link, then come back and sign in.');
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <Text style={[type.display, { color: colors.text }]}>Create an account</Text>
            <Text style={[type.body, { color: colors.textMuted }]}>
              You will set up or join a kitchen next.
            </Text>
          </View>

          <View style={s.form}>
            <Field
              label="Your name"
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Alex"
              autoComplete="name"
              hint="Shown to the other people in your household."
            />
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
              autoComplete="new-password"
              placeholder="At least 8 characters"
              onSubmitEditing={submit}
              returnKeyType="go"
            />

            {error ? <ErrorNote message={error} /> : null}
            {notice ? (
              <View style={s.notice}>
                <Text style={[type.small, { color: colors.text }]}>{notice}</Text>
              </View>
            ) : null}

            <Button title="Create account" onPress={submit} loading={busy} />

            <Link href="/(auth)/sign-in" style={s.link}>
              <Text style={[type.small, { color: colors.primary }]}>
                Already have an account? Sign in
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
  notice: { backgroundColor: colors.primarySoft, borderRadius: 12, padding: space.md },
});
