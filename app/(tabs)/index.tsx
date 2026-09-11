import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RecipeCard } from '@/components/RecipeCard';
import { Button, Empty, ErrorNote, Loading } from '@/components/ui';
import { usePantry } from '@/lib/queries/pantry';
import { useAddMissingToList, useMatches } from '@/lib/queries/recipes';
import { colors, radius, space, type } from '@/lib/theme';
import type { MealType } from '@/lib/types';

const MEAL_FILTERS: { key: MealType | 'all'; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snacks' },
];

export default function CookScreen() {
  const router = useRouter();
  const [meal, setMeal] = useState<MealType | 'all'>('all');

  const matches = useMatches(2);
  const pantry = usePantry();
  const addMissing = useAddMissingToList();
  const [addingId, setAddingId] = useState<string | null>(null);

  const { ready, almost } = useMemo(() => {
    const rows = (matches.data ?? []).filter(
      (r) => meal === 'all' || r.meal_types.includes(meal),
    );
    return {
      ready: rows.filter((r) => r.missing_count === 0),
      almost: rows.filter((r) => r.missing_count > 0),
    };
  }, [matches.data, meal]);

  const handleAddMissing = async (recipeId: string) => {
    setAddingId(recipeId);
    try {
      await addMissing.mutateAsync(recipeId);
    } finally {
      setAddingId(null);
    }
  };

  if (matches.isLoading || pantry.isLoading) return <Loading label="Checking your pantry" />;

  if (matches.error) {
    return (
      <View style={{ padding: space.lg }}>
        <ErrorNote message={(matches.error as Error).message} />
      </View>
    );
  }

  const pantryCount = pantry.data?.length ?? 0;

  // A pantry with nothing in it is the first-run state, and it needs a
  // different answer from "nothing matched".
  if (pantryCount === 0) {
    return (
      <ScrollView contentContainerStyle={s.scroll}>
        <Empty
          title="Your pantry is empty"
          body="Scan a grocery receipt or add a few things by hand, and this screen will fill up with what you can actually cook."
          action={
            <View style={{ gap: space.sm, width: '100%', paddingTop: space.md }}>
              <Button title="Scan a receipt" onPress={() => router.push('/scan')} />
              <Button
                title="Add items by hand"
                variant="secondary"
                onPress={() => router.push('/(tabs)/pantry')}
              />
            </View>
          }
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={s.scroll}
      refreshControl={
        <RefreshControl refreshing={matches.isRefetching} onRefresh={() => matches.refetch()} />
      }
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filters}
      >
        {MEAL_FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setMeal(f.key)}
            style={[s.filter, meal === f.key && s.filterActive]}
          >
            <Text
              style={[
                type.smallStrong,
                { color: meal === f.key ? colors.primaryText : colors.textMuted },
              ]}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {ready.length === 0 && almost.length === 0 ? (
        <Empty
          title="Nothing matches yet"
          body={
            meal === 'all'
              ? 'You have items in the pantry, but nothing in the recipe library lines up with them. Add a few more staples and try again.'
              : 'Nothing for this meal. Try another filter, or add more to your pantry.'
          }
          action={
            <Button
              title="Add to pantry"
              variant="secondary"
              onPress={() => router.push('/(tabs)/pantry')}
            />
          }
        />
      ) : null}

      {ready.length > 0 ? (
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Ionicons name="checkmark-circle" size={16} color={colors.ready} />
            <Text style={[type.heading, { color: colors.text }]}>Ready to cook</Text>
            <Text style={[type.small, { color: colors.textFaint }]}>{ready.length}</Text>
          </View>
          <View style={s.cards}>
            {ready.map((r) => (
              <RecipeCard key={r.recipe_id} recipe={r} />
            ))}
          </View>
        </View>
      ) : null}

      {almost.length > 0 ? (
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Ionicons name="cart" size={16} color={colors.almost} />
            <Text style={[type.heading, { color: colors.text }]}>Almost there</Text>
            <Text style={[type.small, { color: colors.textFaint }]}>{almost.length}</Text>
          </View>
          <Text style={[type.small, { color: colors.textMuted, paddingHorizontal: space.lg }]}>
            One or two items short. Tap to add what you need to the shopping list.
          </Text>
          <View style={s.cards}>
            {almost.map((r) => (
              <RecipeCard
                key={r.recipe_id}
                recipe={r}
                onAddMissing={handleAddMissing}
                addingMissing={addingId === r.recipe_id}
              />
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { paddingBottom: space.xxl, gap: space.lg },
  filters: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm },
  filter: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  filterActive: { backgroundColor: colors.primary },
  section: { gap: space.sm },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  cards: { paddingHorizontal: space.lg, gap: space.md },
});
