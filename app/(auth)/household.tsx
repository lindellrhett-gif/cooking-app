import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, ErrorNote, Field } from '@/components/ui';
import { useCreateHousehold, useJoinHousehold } from '@/lib/queries/household';
import { supabase } from '@/lib/supabase';
import { colors, radius, space, type } from '@/lib/theme';

/**
 * Sits between sign-in and the app proper. A pantry belongs to a household,
 * so there is nothing meaningful to show until this is answered.
 */
export default function HouseholdSetup() {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createHousehold = useCreateHousehold();
  const joinHousehold = useJoinHousehold();

  const submit = async () => {
    setError(null);
    try {
      if (mode === 'create') {
        await createHousehold.mutateAsync(name);
      } else {
        if (code.trim().length !== 6) {
          setError('Invite codes are six characters.');
          return;
        }
        await joinHousehold.mutateAsync(code);
      }
      // The root navigator moves to the tabs once the profile refetches.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  };

  const busy = createHousehold.isPending || joinHousehold.isPending;

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <Text style={[type.display, { color: colors.text }]}>Your kitchen</Text>
            <Text style={[type.body, { color: colors.textMuted }]}>
              Everyone in a household shares one pantry and one shopping list.
            </Text>
          </View>

          <View style={s.toggle}>
            <ToggleOption
              label="Start a new one"
              active={mode === 'create'}
              onPress={() => setMode('create')}
            />
            <ToggleOption
              label="Join with a code"
              active={mode === 'join'}
              onPress={() => setMode('join')}
            />
          </View>

          <Card style={{ gap: space.lg }}>
            {mode === 'create' ? (
              <Field
                label="Household name"
                value={name}
                onChangeText={setName}
                placeholder="My Kitchen"
                hint="You will get an invite code to share once it exists."
              />
            ) : (
              <Field
                label="Invite code"
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
                placeholder="ABC234"
                autoCapitalize="characters"
                maxLength={6}
                hint="Ask whoever set up the household for their six-character code."
              />
            )}

            {error ? <ErrorNote message={error} /> : null}

            <Button
              title={mode === 'create' ? 'Create household' : 'Join household'}
              onPress={submit}
              loading={busy}
            />
          </Card>

          <Pressable onPress={() => supabase.auth.signOut()} style={s.signOut}>
            <Text style={[type.small, { color: colors.textMuted }]}>Sign out</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ToggleOption({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.toggleOption, active && { backgroundColor: colors.surface }]}
    >
      <Text
        style={[
          type.smallStrong,
          { color: active ? colors.text : colors.textMuted, textAlign: 'center' },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: space.xl, gap: space.xl },
  header: { gap: space.xs },
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  toggleOption: { flex: 1, paddingVertical: space.sm, borderRadius: radius.sm },
  signOut: { alignSelf: 'center', paddingVertical: space.sm },
});
