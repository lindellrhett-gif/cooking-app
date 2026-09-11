import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, ErrorNote, Loading, Macros, Pill } from '@/components/ui';
import { usePantry, useRemovePantryItem } from '@/lib/queries/pantry';
import {
  useAddMissingToList,
  useFavorites,
  useLogCooked,
  useRecipe,
  useRecipeAvailability,
  useToggleFavorite,
} from '@/lib/queries/recipes';
import { colors, radius, space, type } from '@/lib/theme';

export default function RecipeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const recipe = useRecipe(id);
  const availability = useRecipeAvailability(id);
  const favorites = useFavorites();
  const toggleFavorite = useToggleFavorite();
  const addMissing = useAddMissingToList();
  const logCooked = useLogCooked();

  const [cookedPromptOpen, setCookedPromptOpen] = useState(false);
  const [addedCount, setAddedCount] = useState<number | null>(null);

  const isFavorite = (favorites.data ?? []).some((r) => r.id === id);

  const { have, missing } = useMemo(() => {
    const lines = availability.data ?? [];
    return {
      have: lines.filter((l) => l.in_pantry),
      missing: lines.filter((l) => !l.in_pantry && !l.is_optional),
    };
  }, [availability.data]);

  if (recipe.isLoading || availability.isLoading) return <Loading />;

  if (recipe.error) {
    return (
      <View style={{ padding: space.lg }}>
        <ErrorNote message={(recipe.error as Error).message} />
      </View>
    );
  }

  if (!recipe.data) {
    return (
      <View style={{ padding: space.lg }}>
        <ErrorNote message="That recipe no longer exists." />
      </View>
    );
  }

  const r = recipe.data;
  const totalMinutes = r.prep_minutes + r.cook_minutes;

  const handleCooked = async () => {
    await logCooked.mutateAsync(r.id);
    setCookedPromptOpen(true);
  };

  const handleAddMissing = async () => {
    const count = await addMissing.mutateAsync(r.id);
    setAddedCount(count);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <Pressable
              onPress={() => toggleFavorite.mutate({ recipeId: r.id, isFavorite })}
              hitSlop={12}
            >
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={24}
                color={isFavorite ? colors.primary : colors.textMuted}
              />
            </Pressable>
          ),
        }}
      />

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.header}>
          <Text style={[type.display, { color: colors.text }]}>{r.title}</Text>
          <Text style={[type.body, { color: colors.textMuted }]}>{r.description}</Text>

          <View style={s.metaRow}>
            <Meta icon="time-outline" label={`${totalMinutes} min`} />
            <Meta icon="people-outline" label={`Serves ${r.servings}`} />
            {r.cuisine ? <Meta icon="location-outline" label={r.cuisine} /> : null}
          </View>

          {r.diet_flags.length > 0 ? (
            <View style={s.pillRow}>
              {r.diet_flags.map((f) => (
                <Pill key={f} label={f.replace('-', ' ')} />
              ))}
            </View>
          ) : null}
        </View>

        <View style={s.block}>
          <Card>
            <Macros
              calories={r.calories}
              protein={r.protein_g}
              carbs={r.carbs_g}
              fat={r.fat_g}
            />
          </Card>
        </View>

        <View style={s.block}>
          <View style={s.blockHead}>
            <Text style={[type.title, { color: colors.text }]}>Ingredients</Text>
            <Text style={[type.small, { color: colors.textFaint }]}>
              {have.length} of {availability.data?.length ?? 0} on hand
            </Text>
          </View>

          <Card style={{ gap: space.sm }}>
            {(availability.data ?? []).map((line) => (
              <View key={line.ingredient_id} style={s.ingredientRow}>
                <Ionicons
                  name={line.in_pantry ? 'checkmark-circle' : 'ellipse-outline'}
                  size={18}
                  color={line.in_pantry ? colors.ready : colors.borderStrong}
                />
                <Text
                  style={[
                    type.body,
                    { flex: 1, color: line.in_pantry ? colors.text : colors.textMuted },
                  ]}
                >
                  {formatAmount(line.quantity, line.unit)} {line.display_name}
                  {line.is_optional ? (
                    <Text style={[type.small, { color: colors.textFaint }]}> optional</Text>
                  ) : null}
                </Text>
              </View>
            ))}
          </Card>

          {missing.length > 0 ? (
            <View style={{ gap: space.sm }}>
              <Button
                title={
                  addedCount === null
                    ? `Add ${missing.length} missing to shopping list`
                    : addedCount === 0
                      ? 'Already on your list'
                      : `Added ${addedCount} to your list`
                }
                variant="secondary"
                onPress={handleAddMissing}
                loading={addMissing.isPending}
                disabled={addedCount !== null}
              />
            </View>
          ) : null}
        </View>

        <View style={s.block}>
          <Text style={[type.title, { color: colors.text }]}>Method</Text>
          <View style={{ gap: space.md }}>
            {r.instructions.map((step, i) => (
              <View key={i} style={s.step}>
                <View style={s.stepNumber}>
                  <Text style={[type.smallStrong, { color: colors.primary }]}>{i + 1}</Text>
                </View>
                <Text style={[type.body, { color: colors.text, flex: 1, lineHeight: 22 }]}>
                  {step}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.block}>
          <Button
            title="I cooked this"
            onPress={handleCooked}
            loading={logCooked.isPending}
          />
        </View>
      </ScrollView>

      <CookedPrompt
        visible={cookedPromptOpen}
        onClose={() => setCookedPromptOpen(false)}
        recipeId={r.id}
      />
    </>
  );
}

/**
 * After cooking, offer to clear out what got used up.
 *
 * Nothing is removed automatically. The app knows the recipe called for rice;
 * it cannot know whether that finished the bag or took a cupful out of it.
 * That judgement stays with the person who just cooked.
 */
function CookedPrompt({
  visible,
  onClose,
  recipeId,
}: {
  visible: boolean;
  onClose: () => void;
  recipeId: string;
}) {
  const availability = useRecipeAvailability(recipeId);
  const pantry = usePantry();
  const removeItem = useRemovePantryItem();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Only ingredients that are actually sitting in the pantry can be removed.
  // Staples counted as present without a row have nothing to delete.
  const removable = useMemo(() => {
    const pantryByIngredient = new Map((pantry.data ?? []).map((p) => [p.ingredient_id, p]));
    return (availability.data ?? [])
      .filter((line) => pantryByIngredient.has(line.ingredient_id))
      .map((line) => ({ line, item: pantryByIngredient.get(line.ingredient_id)! }));
  }, [availability.data, pantry.data]);

  const toggle = (ingredientId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ingredientId)) next.delete(ingredientId);
      else next.add(ingredientId);
      return next;
    });
  };

  const confirm = async () => {
    for (const { line, item } of removable) {
      if (!selected.has(line.ingredient_id)) continue;
      await removeItem.mutateAsync({
        id: item.id,
        ingredient_id: item.ingredient_id,
        is_staple: item.ingredient?.is_staple ?? false,
      });
    }
    setSelected(new Set());
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView contentContainerStyle={s.promptScroll}>
          <Text style={[type.title, { color: colors.text }]}>Used anything up?</Text>
          <Text style={[type.body, { color: colors.textMuted }]}>
            Tick whatever you finished and it will come out of the pantry. Leave the rest alone.
          </Text>

          {removable.length === 0 ? (
            <Text style={[type.small, { color: colors.textFaint }]}>
              Nothing from this recipe is tracked in your pantry right now.
            </Text>
          ) : (
            <Card style={{ gap: space.sm }}>
              {removable.map(({ line }) => {
                const on = selected.has(line.ingredient_id);
                return (
                  <Pressable
                    key={line.ingredient_id}
                    onPress={() => toggle(line.ingredient_id)}
                    style={s.promptRow}
                  >
                    <Ionicons
                      name={on ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={on ? colors.primary : colors.borderStrong}
                    />
                    <Text style={[type.body, { color: colors.text, flex: 1 }]}>
                      {line.display_name}
                    </Text>
                  </Pressable>
                );
              })}
            </Card>
          )}

          <View style={{ gap: space.sm }}>
            <Button
              title={
                selected.size === 0
                  ? 'Done'
                  : `Remove ${selected.size} ${selected.size === 1 ? 'item' : 'items'}`
              }
              onPress={selected.size === 0 ? onClose : confirm}
              loading={removeItem.isPending}
            />
            {selected.size > 0 ? (
              <Button title="Skip" variant="ghost" onPress={onClose} />
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Meta({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={s.meta}>
      <Ionicons name={icon} size={14} color={colors.textFaint} />
      <Text style={[type.small, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

function formatAmount(quantity: number | null, unit: string | null) {
  if (quantity == null) return '';
  const qty = Number(quantity);
  const rounded = Number.isInteger(qty) ? String(qty) : String(qty).replace(/0+$/, '');
  return `${rounded}${unit ? ` ${unit}` : ''}`;
}

const s = StyleSheet.create({
  scroll: { paddingBottom: space.xxl, gap: space.xl },
  header: { paddingHorizontal: space.lg, gap: space.sm },
  metaRow: { flexDirection: 'row', gap: space.lg, flexWrap: 'wrap', paddingTop: space.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pillRow: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap', paddingTop: space.xs },
  block: { paddingHorizontal: space.lg, gap: space.md },
  blockHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  step: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptScroll: { padding: space.lg, gap: space.lg },
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 2 },
});
