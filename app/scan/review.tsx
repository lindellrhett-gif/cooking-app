import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { IngredientPicker } from '@/components/IngredientPicker';
import { Button, Card, Empty, ErrorNote, Loading, Pill } from '@/components/ui';
import { useHouseholdId } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { colors, radius, space, type } from '@/lib/theme';
import type { Ingredient, ParsedReceipt, ReviewItem } from '@/lib/types';

/**
 * Everything the parser produced, laid out for a human to correct.
 *
 * This screen is not a formality. Receipt abbreviations are genuinely
 * ambiguous, and a wrong guess that slips into the pantry makes the Cook tab
 * suggest meals from food the household does not own, with no way to tell why.
 * So: unmatched and low-confidence rows sort to the top, every row can be
 * edited or dropped, and nothing is written until Confirm.
 */
export default function ReviewScreen() {
  const router = useRouter();
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  const { scanId, payload } = useLocalSearchParams<{ scanId: string; payload: string }>();

  const parsed = useMemo<ParsedReceipt | null>(() => {
    try {
      return JSON.parse(payload) as ParsedReceipt;
    } catch {
      return null;
    }
  }, [payload]);

  const slugs = useMemo(
    () =>
      [...new Set((parsed?.items ?? []).map((i) => i.ingredient_slug).filter(Boolean))] as string[],
    [parsed],
  );

  const ingredients = useQuery({
    queryKey: ['ingredients-by-slug', slugs.join(',')],
    enabled: slugs.length > 0,
    queryFn: async (): Promise<Ingredient[]> => {
      const { data, error } = await supabase.from('ingredients').select('*').in('slug', slugs);
      if (error) throw error;
      return (data ?? []) as Ingredient[];
    },
  });

  const [items, setItems] = useState<ReviewItem[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!parsed) return;
    if (slugs.length > 0 && !ingredients.data) return;

    const bySlug = new Map((ingredients.data ?? []).map((i) => [i.slug, i]));

    const mapped: ReviewItem[] = parsed.items.map((item, index) => {
      const ingredient = item.ingredient_slug ? (bySlug.get(item.ingredient_slug) ?? null) : null;
      return {
        ...item,
        key: `${index}-${item.raw_line}`,
        ingredient,
        // A row with no ingredient cannot be added, and a low-confidence row
        // deserves a deliberate yes rather than a default one.
        include: !!ingredient && item.confidence !== 'low',
      };
    });

    // Things needing attention first.
    mapped.sort((a, b) => rank(a) - rank(b));
    setItems(mapped);
  }, [parsed, ingredients.data, slugs.length]);

  const setIngredient = (key: string, ingredient: Ingredient) => {
    setItems((prev) =>
      prev.map((i) => (i.key === key ? { ...i, ingredient, include: true } : i)),
    );
  };

  const toggleInclude = (key: string) => {
    setItems((prev) =>
      prev.map((i) => (i.key === key && i.ingredient ? { ...i, include: !i.include } : i)),
    );
  };

  const confirm = async () => {
    setError(null);
    setSaving(true);

    const chosen = items
      .filter((i) => i.include && i.ingredient)
      .map((i) => ({
        ingredient_id: i.ingredient!.id,
        quantity: i.quantity,
        unit: i.unit ?? i.ingredient!.default_unit,
      }));

    const { error: rpcError } = await supabase.rpc('apply_receipt_items', {
      p_household_id: householdId,
      p_scan_id: scanId,
      p_items: chosen,
    });

    setSaving(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['pantry', householdId] });
    queryClient.invalidateQueries({ queryKey: ['matches', householdId] });
    queryClient.invalidateQueries({ queryKey: ['shopping', householdId] });
    queryClient.invalidateQueries({ queryKey: ['staple-optouts', householdId] });

    router.replace('/(tabs)/pantry');
  };

  if (!parsed) {
    return (
      <View style={{ padding: space.lg }}>
        <ErrorNote message="Could not read the scan results. Try scanning again." />
      </View>
    );
  }

  if (slugs.length > 0 && ingredients.isLoading) return <Loading />;

  const includedCount = items.filter((i) => i.include && i.ingredient).length;
  const unmatchedCount = items.filter((i) => !i.ingredient).length;

  if (items.length === 0) {
    return (
      <ScrollView contentContainerStyle={{ padding: space.lg }}>
        <Empty
          title="Nothing found on that receipt"
          body="Either the photo was hard to read or there was no food on it. Try again with the receipt flattened and well lit."
          action={<Button title="Scan again" onPress={() => router.replace('/scan')} />}
        />
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.intro}>
          <Text style={[type.body, { color: colors.textMuted }]}>
            {parsed.store ? `${parsed.store}. ` : ''}
            Found {items.length} {items.length === 1 ? 'item' : 'items'}.
            {unmatchedCount > 0
              ? ` ${unmatchedCount} could not be matched and ${unmatchedCount === 1 ? 'needs' : 'need'} picking by hand.`
              : ''}
          </Text>
        </View>

        {items.map((item) => (
          <Card key={item.key} style={s.row}>
            <Pressable
              onPress={() => toggleInclude(item.key)}
              disabled={!item.ingredient}
              hitSlop={6}
            >
              <Ionicons
                name={item.include ? 'checkbox' : 'square-outline'}
                size={22}
                color={
                  !item.ingredient
                    ? colors.border
                    : item.include
                      ? colors.primary
                      : colors.borderStrong
                }
              />
            </Pressable>

            <View style={{ flex: 1, gap: space.xs }}>
              <Text style={[type.bodyStrong, { color: colors.text }]}>
                {item.ingredient?.display_name ?? item.guessed_name}
              </Text>

              <Text style={[type.small, { color: colors.textFaint }]} numberOfLines={1}>
                {item.raw_line}
                {item.quantity ? ` · ${item.quantity} ${item.unit ?? ''}`.trimEnd() : ''}
              </Text>

              <View style={s.badges}>
                {!item.ingredient ? (
                  <Pill label="Pick one" tone="almost" />
                ) : item.confidence === 'low' ? (
                  <Pill label="Unsure" tone="almost" />
                ) : item.confidence === 'medium' ? (
                  <Pill label="Probably" tone="neutral" />
                ) : null}

                <Pressable onPress={() => setEditing(item.key)} hitSlop={6}>
                  <Text style={[type.small, { color: colors.primary }]}>
                    {item.ingredient ? 'Change' : 'Choose ingredient'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </Card>
        ))}

        <Text style={[type.small, { color: colors.textFaint, paddingHorizontal: space.xs }]}>
          Anything already on your shopping list gets ticked off automatically.
        </Text>
      </ScrollView>

      <View style={s.footer}>
        {error ? <ErrorNote message={error} /> : null}
        <Button
          title={
            includedCount === 0
              ? 'Nothing selected'
              : `Add ${includedCount} to pantry`
          }
          onPress={confirm}
          loading={saving}
          disabled={includedCount === 0}
        />
      </View>

      <IngredientPicker
        visible={editing !== null}
        onClose={() => setEditing(null)}
        onSelect={(ingredient) => editing && setIngredient(editing, ingredient)}
        title="Which ingredient is this?"
        initialQuery={items.find((i) => i.key === editing)?.guessed_name ?? ''}
      />
    </View>
  );
}

/** Unmatched first, then low confidence, then everything else. */
function rank(item: ReviewItem) {
  if (!item.ingredient) return 0;
  if (item.confidence === 'low') return 1;
  if (item.confidence === 'medium') return 2;
  return 3;
}

const s = StyleSheet.create({
  scroll: { padding: space.lg, gap: space.sm, paddingBottom: space.xxl },
  intro: { paddingBottom: space.xs },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, padding: space.md },
  badges: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  footer: {
    padding: space.lg,
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
