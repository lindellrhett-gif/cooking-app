import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, Switch, Text, View } from 'react-native';

import { Loading } from '@/components/ui';
import { useAllStaples, useSetStapleStock, useStapleOptOuts } from '@/lib/queries/pantry';
import { categoryLabel, colors, sortByCategory, space, type } from '@/lib/theme';
import type { Ingredient } from '@/lib/types';

/**
 * The honest half of the staple assumption.
 *
 * Matching treats salt, oil and the spice rack as always present, which is
 * what stops the Cook tab being empty on day one. This screen is where that
 * assumption can be corrected when a household actually runs out.
 */
export default function StaplesScreen() {
  const staples = useAllStaples();
  const optOuts = useStapleOptOuts();
  const setStock = useSetStapleStock();

  const outOfStock = useMemo(() => new Set(optOuts.data ?? []), [optOuts.data]);

  const sections = useMemo(() => {
    const map = new Map<string, Ingredient[]>();
    for (const i of staples.data ?? []) {
      if (!map.has(i.category)) map.set(i.category, []);
      map.get(i.category)!.push(i);
    }
    return [...map.entries()]
      .sort((a, b) => sortByCategory(a[0], b[0]))
      .map(([category, items]) => ({ title: categoryLabel(category), data: items }));
  }, [staples.data]);

  if (staples.isLoading) return <Loading />;

  return (
    <>
      <Stack.Screen options={{ title: 'Staples' }} />
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <View style={s.intro}>
            <Text style={[type.body, { color: colors.textMuted }]}>
              These are treated as in stock so that everyday recipes are not blocked by a pinch of
              salt. Switch one off when you actually run out, and recipes needing it will move to
              Almost there.
            </Text>
            {outOfStock.size > 0 ? (
              <View style={s.notice}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.almost} />
                <Text style={[type.small, { color: colors.almost }]}>
                  {outOfStock.size} marked as run out.
                </Text>
              </View>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={s.sectionHeader}>{section.title.toUpperCase()}</Text>
        )}
        renderItem={({ item }) => {
          const inStock = !outOfStock.has(item.id);
          return (
            <Pressable
              style={s.row}
              onPress={() => setStock.mutate({ ingredientId: item.id, inStock: !inStock })}
            >
              <Text style={[type.body, { color: colors.text, flex: 1 }]}>
                {item.display_name}
              </Text>
              <Text
                style={[type.small, { color: inStock ? colors.textFaint : colors.almost }]}
              >
                {inStock ? 'Have it' : 'Out'}
              </Text>
              <Switch
                value={inStock}
                onValueChange={(next) =>
                  setStock.mutate({ ingredientId: item.id, inStock: next })
                }
                trackColor={{ true: colors.ready, false: colors.borderStrong }}
              />
            </Pressable>
          );
        }}
      />
    </>
  );
}

const s = StyleSheet.create({
  list: { paddingBottom: space.xxl },
  intro: { padding: space.lg, gap: space.md },
  notice: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  sectionHeader: {
    ...type.tiny,
    color: colors.textFaint,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    marginHorizontal: space.lg,
    marginBottom: 1,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    minHeight: 52,
  },
});
