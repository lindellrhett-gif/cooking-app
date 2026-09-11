import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { IngredientPicker } from '@/components/IngredientPicker';
import { Empty, ErrorNote, Loading } from '@/components/ui';
import {
  useAddPantryItem,
  usePantry,
  useRemovePantryItem,
  useStapleOptOuts,
} from '@/lib/queries/pantry';
import { categoryLabel, colors, radius, sortByCategory, space, type } from '@/lib/theme';
import type { Ingredient, PantryItem } from '@/lib/types';

export default function PantryScreen() {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);

  const pantry = usePantry();
  const optOuts = useStapleOptOuts();
  const addItem = useAddPantryItem();
  const removeItem = useRemovePantryItem();

  const sections = useMemo(() => {
    const byCategory = new Map<string, PantryItem[]>();
    for (const item of pantry.data ?? []) {
      const key = item.ingredient?.category ?? 'pantry';
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key)!.push(item);
    }
    return [...byCategory.entries()]
      .sort((a, b) => sortByCategory(a[0], b[0]))
      .map(([category, items]) => ({
        title: categoryLabel(category),
        data: items.sort((a, b) =>
          (a.ingredient?.display_name ?? '').localeCompare(b.ingredient?.display_name ?? ''),
        ),
      }));
  }, [pantry.data]);

  const handleAdd = (ingredient: Ingredient) => {
    addItem.mutate({ ingredientId: ingredient.id, unit: ingredient.default_unit });
  };

  const handleRemove = (item: PantryItem) => {
    const isStaple = item.ingredient?.is_staple ?? false;
    const name = item.ingredient?.display_name ?? 'this item';

    const doRemove = () =>
      removeItem.mutate({
        id: item.id,
        ingredient_id: item.ingredient_id,
        is_staple: isStaple,
      });

    // Alert is not available on web, and confirm is not available on native.
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(`Remove ${name} from the pantry?`)) doRemove();
      return;
    }

    Alert.alert('Remove from pantry', `Remove ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: doRemove },
    ]);
  };

  if (pantry.isLoading) return <Loading />;

  if (pantry.error) {
    return (
      <View style={{ padding: space.lg }}>
        <ErrorNote message={(pantry.error as Error).message} />
      </View>
    );
  }

  const outOfStaples = optOuts.data?.length ?? 0;

  return (
    <View style={{ flex: 1 }}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={s.list}
        refreshControl={
          <RefreshControl refreshing={pantry.isRefetching} onRefresh={() => pantry.refetch()} />
        }
        ListHeaderComponent={
          <View style={s.headerActions}>
            <Pressable onPress={() => setPickerOpen(true)} style={s.action}>
              <Ionicons name="add-circle-outline" size={19} color={colors.primary} />
              <Text style={[type.bodyStrong, { color: colors.primary }]}>Add an item</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/scan')} style={s.action}>
              <Ionicons name="scan-outline" size={19} color={colors.primary} />
              <Text style={[type.bodyStrong, { color: colors.primary }]}>Scan receipt</Text>
            </Pressable>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={s.sectionHeader}>{section.title.toUpperCase()}</Text>
        )}
        renderItem={({ item }) => (
          <View style={s.row}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.body, { color: colors.text }]}>
                {item.ingredient?.display_name ?? 'Unknown'}
              </Text>
              <Text style={[type.small, { color: colors.textFaint }]}>
                {formatQuantity(item)}
                {item.source === 'receipt' ? ' · from a receipt' : ''}
              </Text>
            </View>
            <Pressable onPress={() => handleRemove(item)} hitSlop={10} style={s.remove}>
              <Ionicons name="trash-outline" size={18} color={colors.textFaint} />
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <Empty
            title="Nothing here yet"
            body="Add what you have, or scan a receipt to fill this in all at once. The Cook tab works from whatever is on this list."
          />
        }
        ListFooterComponent={
          <View style={s.footer}>
            <Text style={[type.small, { color: colors.textFaint }]}>
              Salt, oil, pepper and the spice rack are assumed to be in stock and are not listed
              here. Manage them under Settings, staples.
              {outOfStaples > 0
                ? ` You have marked ${outOfStaples} ${outOfStaples === 1 ? 'staple' : 'staples'} as run out.`
                : ''}
            </Text>
          </View>
        }
      />

      <IngredientPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleAdd}
        title="Add to pantry"
      />
    </View>
  );
}

function formatQuantity(item: PantryItem) {
  if (item.quantity == null) return item.unit ?? 'in stock';
  const qty = Number(item.quantity);
  const rounded = Number.isInteger(qty) ? qty : qty.toFixed(2).replace(/0+$/, '');
  return `${rounded} ${item.unit ?? ''}`.trim();
}

const s = StyleSheet.create({
  list: { paddingBottom: space.xxl },
  headerActions: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.lg,
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
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
    backgroundColor: colors.surface,
    marginHorizontal: space.lg,
    marginBottom: 1,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.md,
  },
  remove: { padding: space.xs },
  footer: { padding: space.lg, paddingTop: space.xl },
});
