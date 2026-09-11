import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Pill } from '@/components/ui';
import type { MatchedRecipe } from '@/lib/types';
import { colors, radius, shadow, space, type } from '@/lib/theme';

export function RecipeCard({
  recipe,
  onAddMissing,
  addingMissing,
}: {
  recipe: MatchedRecipe;
  onAddMissing?: (recipeId: string) => void;
  addingMissing?: boolean;
}) {
  const totalMinutes = recipe.prep_minutes + recipe.cook_minutes;
  const ready = recipe.missing_count === 0;

  return (
    <Link href={{ pathname: '/recipe/[id]', params: { id: recipe.recipe_id } }} asChild>
      <Pressable style={({ pressed }) => [s.card, pressed && { opacity: 0.8 }]}>
        <View style={s.topRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.heading, { color: colors.text }]}>{recipe.title}</Text>
            <Text style={[type.small, { color: colors.textMuted }]} numberOfLines={2}>
              {recipe.description}
            </Text>
          </View>
          {recipe.is_favorite ? (
            <Ionicons name="heart" size={18} color={colors.primary} />
          ) : null}
        </View>

        <View style={s.metaRow}>
          <Meta icon="time-outline" label={`${totalMinutes} min`} />
          <Meta icon="flame-outline" label={`${recipe.calories} kcal`} />
          <Meta icon="barbell-outline" label={`${Math.round(recipe.protein_g)}g protein`} />
        </View>

        {ready ? (
          <Pill label="Ready to cook" tone="ready" />
        ) : (
          <View style={s.missingBlock}>
            <Text style={[type.small, { color: colors.almost }]}>
              {recipe.missing_count === 1 ? 'Missing ' : `Missing ${recipe.missing_count}: `}
              <Text style={type.smallStrong}>
                {recipe.missing_ingredient_names.join(', ')}
              </Text>
            </Text>
            {onAddMissing ? (
              <Pressable
                onPress={(e) => {
                  // The card is a link. Without this the tap navigates away.
                  e.stopPropagation();
                  onAddMissing(recipe.recipe_id);
                }}
                disabled={addingMissing}
                style={({ pressed }) => [s.addButton, pressed && { opacity: 0.7 }]}
                hitSlop={6}
              >
                <Ionicons name="add" size={14} color={colors.almost} />
                <Text style={[type.tiny, { color: colors.almost, textTransform: 'none' }]}>
                  {addingMissing ? 'Adding' : 'Add to list'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </Pressable>
    </Link>
  );
}

function Meta({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={s.meta}>
      <Ionicons name={icon} size={13} color={colors.textFaint} />
      <Text style={[type.small, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.md,
    ...shadow.card,
  },
  topRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  metaRow: { flexDirection: 'row', gap: space.lg, flexWrap: 'wrap' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  missingBlock: {
    backgroundColor: colors.almostSoft,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
  },
});
