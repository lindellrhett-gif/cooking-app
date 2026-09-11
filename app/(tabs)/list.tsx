import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { IngredientPicker } from '@/components/IngredientPicker';
import { Empty, ErrorNote, Loading } from '@/components/ui';
import {
  useAddShoppingItem,
  useClearChecked,
  useMoveCheckedToPantry,
  useRemoveShoppingItem,
  useShoppingList,
  useToggleShoppingItem,
} from '@/lib/queries/shopping';
import { categoryLabel, colors, radius, sortByCategory, space, type } from '@/lib/theme';
import type { Ingredient, ShoppingListItem } from '@/lib/types';

export default function ShoppingListScreen() {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [freeText, setFreeText] = useState('');

  const list = useShoppingList();
  const addItem = useAddShoppingItem();
  const toggleItem = useToggleShoppingItem();
  const removeItem = useRemoveShoppingItem();
  const clearChecked = useClearChecked();
  const moveToPantry = useMoveCheckedToPantry();

  const { open, checked } = useMemo(() => {
    const rows = list.data ?? [];
    return {
      open: groupByCategory(rows.filter((i) => !i.is_checked)),
      checked: rows.filter((i) => i.is_checked),
    };
  }, [list.data]);

  const addFreeText = () => {
    const text = freeText.trim();
    if (!text) return;
    addItem.mutate({ freeText: text });
    setFreeText('');
  };

  const addIngredient = (ingredient: Ingredient) => {
    addItem.mutate({ ingredientId: ingredient.id, unit: ingredient.default_unit });
  };

  if (list.isLoading) return <Loading />;

  if (list.error) {
    return (
      <View style={{ padding: space.lg }}>
        <ErrorNote message={(list.error as Error).message} />
      </View>
    );
  }

  const rows = list.data ?? [];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} />
        }
      >
        <View style={s.addBar}>
          <TextInput
            value={freeText}
            onChangeText={setFreeText}
            placeholder="Add anything, even paper towels"
            placeholderTextColor={colors.textFaint}
            style={s.addInput}
            onSubmitEditing={addFreeText}
            returnKeyType="done"
          />
          <Pressable onPress={addFreeText} style={s.addButton} hitSlop={6}>
            <Ionicons name="arrow-up-circle" size={26} color={colors.primary} />
          </Pressable>
        </View>

        <Pressable onPress={() => setPickerOpen(true)} style={s.searchLink}>
          <Ionicons name="search" size={15} color={colors.primary} />
          <Text style={[type.small, { color: colors.primary }]}>
            Search ingredients instead, so it can tick itself off later
          </Text>
        </Pressable>

        {rows.length === 0 ? (
          <Empty
            title="Nothing to buy"
            body="Add items here, or open a recipe from the Cook tab and add whatever it is missing in one tap."
          />
        ) : null}

        {open.map(({ category, items }) => (
          <View key={category} style={s.section}>
            <Text style={s.sectionHeader}>{categoryLabel(category).toUpperCase()}</Text>
            {items.map((item) => (
              <Row
                key={item.id}
                item={item}
                onToggle={() => toggleItem.mutate({ id: item.id, isChecked: item.is_checked })}
                onRemove={() => removeItem.mutate(item.id)}
              />
            ))}
          </View>
        ))}

        {checked.length > 0 ? (
          <View style={s.section}>
            <View style={s.checkedHeader}>
              <Text style={s.sectionHeader}>IN THE BASKET ({checked.length})</Text>
            </View>
            {checked.map((item) => (
              <Row
                key={item.id}
                item={item}
                onToggle={() => toggleItem.mutate({ id: item.id, isChecked: item.is_checked })}
                onRemove={() => removeItem.mutate(item.id)}
              />
            ))}

            <View style={s.checkedActions}>
              <Pressable
                onPress={() => moveToPantry.mutate(rows)}
                disabled={moveToPantry.isPending}
                style={s.checkedAction}
              >
                <Ionicons name="file-tray-stacked-outline" size={16} color={colors.primary} />
                <Text style={[type.smallStrong, { color: colors.primary }]}>
                  Move to pantry
                </Text>
              </Pressable>
              <Pressable
                onPress={() => clearChecked.mutate()}
                disabled={clearChecked.isPending}
                style={s.checkedAction}
              >
                <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                <Text style={[type.smallStrong, { color: colors.textMuted }]}>
                  Clear
                </Text>
              </Pressable>
            </View>
            <Text style={[type.small, { color: colors.textFaint, paddingHorizontal: space.lg }]}>
              Moving items to the pantry only works for rows that came from the ingredient list.
              Anything typed freehand is cleared instead.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <IngredientPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={addIngredient}
        title="Add to shopping list"
      />
    </View>
  );
}

function Row({
  item,
  onToggle,
  onRemove,
}: {
  item: ShoppingListItem;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const label = item.ingredient?.display_name ?? item.free_text ?? 'Item';

  return (
    <View style={s.row}>
      <Pressable onPress={onToggle} hitSlop={8} style={s.checkbox}>
        <Ionicons
          name={item.is_checked ? 'checkbox' : 'square-outline'}
          size={22}
          color={item.is_checked ? colors.ready : colors.borderStrong}
        />
      </Pressable>
      <Pressable onPress={onToggle} style={{ flex: 1 }}>
        <Text
          style={[
            type.body,
            {
              color: item.is_checked ? colors.textFaint : colors.text,
              textDecorationLine: item.is_checked ? 'line-through' : 'none',
            },
          ]}
        >
          {label}
        </Text>
        {item.from_recipe_id ? (
          <Text style={[type.small, { color: colors.textFaint }]}>for a recipe</Text>
        ) : null}
      </Pressable>
      <Pressable onPress={onRemove} hitSlop={8}>
        <Ionicons name="close" size={18} color={colors.textFaint} />
      </Pressable>
    </View>
  );
}

function groupByCategory(items: ShoppingListItem[]) {
  const map = new Map<string, ShoppingListItem[]>();
  for (const item of items) {
    // Freehand entries have no category, so they get their own bucket at the end.
    const key = item.ingredient?.category ?? 'other';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return [...map.entries()]
    .sort((a, b) => sortByCategory(a[0], b[0]))
    .map(([category, list]) => ({ category, items: list }));
}

const s = StyleSheet.create({
  scroll: { paddingBottom: space.xxl },
  addBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    margin: space.lg,
    marginBottom: space.sm,
    paddingLeft: space.md,
    paddingRight: space.sm,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  addInput: { flex: 1, fontSize: 15, color: colors.text },
  addButton: { padding: 2 },
  searchLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  section: { paddingBottom: space.md },
  sectionHeader: {
    ...type.tiny,
    color: colors.textFaint,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  checkedHeader: { flexDirection: 'row', alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    marginHorizontal: space.lg,
    marginBottom: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  checkbox: { padding: 2 },
  checkedActions: {
    flexDirection: 'row',
    gap: space.lg,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  checkedAction: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
