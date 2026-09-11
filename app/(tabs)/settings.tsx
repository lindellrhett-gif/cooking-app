import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { IngredientPicker } from '@/components/IngredientPicker';
import { Button, Card, Field, Loading, SectionHeader } from '@/components/ui';
import {
  useHousehold,
  useHouseholdMembers,
  useLeaveHousehold,
  useUpdateDisplayName,
} from '@/lib/queries/household';
import {
  useIngredientsByIds,
  usePreferences,
  useUpdatePreferences,
} from '@/lib/queries/preferences';
import { useProfile, useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { colors, radius, space, type } from '@/lib/theme';
import type { DietFlag, Ingredient } from '@/lib/types';

const DIETS: { key: DietFlag; label: string }[] = [
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'gluten-free', label: 'Gluten free' },
  { key: 'dairy-free', label: 'Dairy free' },
  { key: 'low-carb', label: 'Low carb' },
  { key: 'high-fiber', label: 'High fibre' },
];

const TIME_LIMITS = [
  { value: null, label: 'Any' },
  { value: 20, label: 'Under 20' },
  { value: 30, label: 'Under 30' },
  { value: 45, label: 'Under 45' },
  { value: 60, label: 'Under 60' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { userId } = useSession();
  const profile = useProfile();
  const household = useHousehold();
  const members = useHouseholdMembers();
  const prefs = usePreferences();
  const updatePrefs = useUpdatePreferences();
  const updateName = useUpdateDisplayName();
  const leaveHousehold = useLeaveHousehold();

  const [name, setName] = useState('');
  const [picker, setPicker] = useState<'allergen' | 'dislike' | null>(null);

  useEffect(() => {
    if (profile.data) setName(profile.data.display_name);
  }, [profile.data]);

  const allergens = prefs.data?.allergen_ingredient_ids ?? [];
  const dislikes = prefs.data?.disliked_ingredient_ids ?? [];
  const allergenNames = useIngredientsByIds(allergens);
  const dislikeNames = useIngredientsByIds(dislikes);

  if (prefs.isLoading || profile.isLoading) return <Loading />;

  const toggleDiet = (diet: DietFlag) => {
    const current = prefs.data?.diets ?? [];
    const next = current.includes(diet) ? current.filter((d) => d !== diet) : [...current, diet];
    updatePrefs.mutate({ diets: next });
  };

  const addIngredientTo = (field: 'allergen' | 'dislike', ingredient: Ingredient) => {
    if (field === 'allergen') {
      if (allergens.includes(ingredient.id)) return;
      updatePrefs.mutate({ allergen_ingredient_ids: [...allergens, ingredient.id] });
    } else {
      if (dislikes.includes(ingredient.id)) return;
      updatePrefs.mutate({ disliked_ingredient_ids: [...dislikes, ingredient.id] });
    }
  };

  const removeIngredientFrom = (field: 'allergen' | 'dislike', id: string) => {
    if (field === 'allergen') {
      updatePrefs.mutate({ allergen_ingredient_ids: allergens.filter((a) => a !== id) });
    } else {
      updatePrefs.mutate({ disliked_ingredient_ids: dislikes.filter((d) => d !== id) });
    }
  };

  const confirmLeave = () => {
    const doLeave = () => leaveHousehold.mutate();
    const message =
      'You will lose access to this pantry and shopping list. Anything you added stays with the household.';

    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(`Leave this household? ${message}`)) doLeave();
      return;
    }
    Alert.alert('Leave this household?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: doLeave },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <SectionHeader title="You" />
      <Card style={{ gap: space.md, marginHorizontal: space.lg }}>
        <Field
          label="Display name"
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          onBlur={() => {
            if (name.trim() && name.trim() !== profile.data?.display_name) {
              updateName.mutate(name);
            }
          }}
          hint="Shown to everyone in your household."
        />
      </Card>

      <SectionHeader title="Diet" />
      <Card style={{ gap: space.md, marginHorizontal: space.lg }}>
        <Text style={[type.small, { color: colors.textMuted }]}>
          Recipes must match every diet you pick. Leave all off to see everything.
        </Text>
        <View style={s.chipWrap}>
          {DIETS.map((d) => {
            const active = (prefs.data?.diets ?? []).includes(d.key);
            return (
              <Pressable
                key={d.key}
                onPress={() => toggleDiet(d.key)}
                style={[s.chip, active && s.chipActive]}
              >
                <Text
                  style={[
                    type.smallStrong,
                    { color: active ? colors.primaryText : colors.textMuted },
                  ]}
                >
                  {d.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <SectionHeader title="Time" />
      <Card style={{ gap: space.md, marginHorizontal: space.lg }}>
        <Text style={[type.small, { color: colors.textMuted }]}>
          Hide anything that takes longer than this, prep included.
        </Text>
        <View style={s.chipWrap}>
          {TIME_LIMITS.map((t) => {
            const active = (prefs.data?.max_cook_minutes ?? null) === t.value;
            return (
              <Pressable
                key={t.label}
                onPress={() => updatePrefs.mutate({ max_cook_minutes: t.value })}
                style={[s.chip, active && s.chipActive]}
              >
                <Text
                  style={[
                    type.smallStrong,
                    { color: active ? colors.primaryText : colors.textMuted },
                  ]}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <SectionHeader title="Never show" />
      <Card style={{ gap: space.md, marginHorizontal: space.lg }}>
        <Text style={[type.small, { color: colors.textMuted }]}>
          Any recipe containing these is hidden completely, including when it appears only as an
          optional garnish.
        </Text>
        <TagList
          items={allergenNames.data ?? []}
          onRemove={(id) => removeIngredientFrom('allergen', id)}
          emptyLabel="Nothing excluded."
        />
        <Pressable onPress={() => setPicker('allergen')} style={s.addLink}>
          <Ionicons name="add-circle-outline" size={17} color={colors.primary} />
          <Text style={[type.smallStrong, { color: colors.primary }]}>Add an ingredient</Text>
        </Pressable>
      </Card>

      <SectionHeader title="Would rather not" />
      <Card style={{ gap: space.md, marginHorizontal: space.lg }}>
        <Text style={[type.small, { color: colors.textMuted }]}>
          Still shown, just pushed further down the list.
        </Text>
        <TagList
          items={dislikeNames.data ?? []}
          onRemove={(id) => removeIngredientFrom('dislike', id)}
          emptyLabel="Nothing on this list."
        />
        <Pressable onPress={() => setPicker('dislike')} style={s.addLink}>
          <Ionicons name="add-circle-outline" size={17} color={colors.primary} />
          <Text style={[type.smallStrong, { color: colors.primary }]}>Add an ingredient</Text>
        </Pressable>
      </Card>

      <SectionHeader title="Household" />
      <Card style={{ gap: space.lg, marginHorizontal: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Text style={[type.smallStrong, { color: colors.textMuted }]}>
            {household.data?.name ?? 'Your kitchen'}
          </Text>
          <Text style={[type.small, { color: colors.textFaint }]}>
            Share this code so someone can join and see the same pantry and list.
          </Text>
          <View style={s.codeBox}>
            <Text selectable style={[type.title, { color: colors.primary, letterSpacing: 4 }]}>
              {household.data?.invite_code ?? '······'}
            </Text>
          </View>
        </View>

        <View style={{ gap: space.sm }}>
          <Text style={[type.smallStrong, { color: colors.textMuted }]}>
            Members ({members.data?.length ?? 0})
          </Text>
          {(members.data ?? []).map((m) => (
            <View key={m.user_id} style={s.memberRow}>
              <Ionicons name="person-circle-outline" size={20} color={colors.textFaint} />
              <Text style={[type.body, { color: colors.text, flex: 1 }]}>
                {m.profile?.display_name || 'Someone'}
                {m.user_id === userId ? ' (you)' : ''}
              </Text>
              {m.role === 'owner' ? (
                <Text style={[type.tiny, { color: colors.textFaint }]}>OWNER</Text>
              ) : null}
            </View>
          ))}
        </View>

        <Pressable onPress={() => router.push('/staples')} style={s.navRow}>
          <Text style={[type.body, { color: colors.text, flex: 1 }]}>Staples we always have</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Pressable>
      </Card>

      <View style={s.dangerZone}>
        <Button title="Leave household" variant="danger" onPress={confirmLeave} />
        <Button title="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />
      </View>

      <IngredientPicker
        visible={picker !== null}
        onClose={() => setPicker(null)}
        onSelect={(ing) => picker && addIngredientTo(picker, ing)}
        title={picker === 'allergen' ? 'Never show recipes with' : 'Would rather not eat'}
      />
    </ScrollView>
  );
}

function TagList({
  items,
  onRemove,
  emptyLabel,
}: {
  items: Ingredient[];
  onRemove: (id: string) => void;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <Text style={[type.small, { color: colors.textFaint }]}>{emptyLabel}</Text>;
  }
  return (
    <View style={s.chipWrap}>
      {items.map((i) => (
        <Pressable key={i.id} onPress={() => onRemove(i.id)} style={s.tag}>
          <Text style={[type.smallStrong, { color: colors.text }]}>{i.display_name}</Text>
          <Ionicons name="close" size={14} color={colors.textFaint} />
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { paddingBottom: space.xxl },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  chipActive: { backgroundColor: colors.primary },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  addLink: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  codeBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: 'center',
    marginTop: space.xs,
  },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dangerZone: { padding: space.lg, paddingTop: space.xl, gap: space.sm },
});
