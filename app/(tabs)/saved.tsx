import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, ErrorNote, Loading, Pill } from '@/components/ui';
import { useFavorites, useMatches } from '@/lib/queries/recipes';
import { colors, radius, shadow, space, type } from '@/lib/theme';

export default function SavedScreen() {
  const router = useRouter();
  const favorites = useFavorites();
  // Used only to mark which saved recipes you could cook right now.
  const matches = useMatches(0);

  const cookableNow = new Set((matches.data ?? []).map((m) => m.recipe_id));

  if (favorites.isLoading) return <Loading />;

  if (favorites.error) {
    return (
      <View style={{ padding: space.lg }}>
        <ErrorNote message={(favorites.error as Error).message} />
      </View>
    );
  }

  return (
    <FlatList
      data={favorites.data ?? []}
      keyExtractor={(r) => r.id}
      contentContainerStyle={s.list}
      refreshControl={
        <RefreshControl
          refreshing={favorites.isRefetching}
          onRefresh={() => favorites.refetch()}
        />
      }
      ListEmptyComponent={
        <Empty
          title="Nothing saved yet"
          body="Tap the heart on any recipe to keep it here. Saved recipes are also pushed up the Cook tab when you have the ingredients."
          action={
            <Button
              title="Find something to cook"
              variant="secondary"
              onPress={() => router.push('/(tabs)')}
            />
          }
        />
      }
      renderItem={({ item }) => (
        <Link href={{ pathname: '/recipe/[id]', params: { id: item.id } }} asChild>
          <Pressable style={({ pressed }) => [s.card, pressed && { opacity: 0.8 }]}>
            <View style={{ flex: 1, gap: space.xs }}>
              <Text style={[type.heading, { color: colors.text }]}>{item.title}</Text>
              <Text style={[type.small, { color: colors.textMuted }]} numberOfLines={2}>
                {item.description}
              </Text>
              <View style={s.metaRow}>
                <Text style={[type.small, { color: colors.textFaint }]}>
                  {item.prep_minutes + item.cook_minutes} min · {item.calories} kcal ·{' '}
                  {Math.round(item.protein_g)}g protein
                </Text>
              </View>
              {cookableNow.has(item.id) ? <Pill label="Ready to cook" tone="ready" /> : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </Pressable>
        </Link>
      )}
    />
  );
}

const s = StyleSheet.create({
  list: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    ...shadow.card,
  },
  metaRow: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
});
