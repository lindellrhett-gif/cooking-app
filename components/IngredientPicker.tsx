import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Empty, Loading, ModalScreen } from '@/components/ui';
import { useIngredientSearch } from '@/lib/queries/pantry';
import { categoryLabel, colors, radius, space, type } from '@/lib/theme';
import type { Ingredient } from '@/lib/types';

/**
 * Searches display names and aliases through the database function, so typing
 * "scallion" finds the row called "Green onion". Used by the pantry, the
 * shopping list, preferences, and the receipt review screen.
 */
export function IngredientPicker({
  visible,
  onClose,
  onSelect,
  title = 'Find an ingredient',
  initialQuery = '',
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (ingredient: Ingredient) => void;
  title?: string;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const { data, isLoading } = useIngredientSearch(query);

  // The modal stays mounted between openings, so seed the box each time it
  // opens. Without this, correcting a second receipt line still shows the
  // first one's search text.
  useEffect(() => {
    if (visible) setQuery(initialQuery);
  }, [visible, initialQuery]);

  const handleSelect = (ingredient: Ingredient) => {
    onSelect(ingredient);
    setQuery('');
    onClose();
  };

  return (
    <ModalScreen visible={visible} onClose={onClose}>
      <View style={s.header}>
        <Text style={[type.title, { color: colors.text, flex: 1 }]}>{title}</Text>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={24} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={s.searchWrap}>
        <Ionicons name="search" size={17} color={colors.textFaint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name, or what the receipt called it"
          placeholderTextColor={colors.textFaint}
          style={s.search}
          autoFocus
          autoCorrect={false}
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={17} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(i) => i.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: space.xxl }}
          ItemSeparatorComponent={() => <View style={s.separator} />}
          ListEmptyComponent={
            <Empty
              title="No match"
              body="Nothing in the ingredient list matches that. Try a simpler word, like the base food rather than the brand."
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handleSelect(item)}
              style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.surfaceAlt }]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.body, { color: colors.text }]}>{item.display_name}</Text>
                <Text style={[type.small, { color: colors.textFaint }]}>
                  {categoryLabel(item.category)}
                  {item.is_staple ? ' · staple' : ''}
                </Text>
              </View>
              <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
            </Pressable>
          )}
        />
      )}
    </ModalScreen>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    paddingHorizontal: space.md,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  search: { flex: 1, fontSize: 15, color: colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  separator: { height: 1, backgroundColor: colors.border, marginLeft: space.lg },
});
