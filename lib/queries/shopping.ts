import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useHouseholdId, useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { ShoppingListItem } from '@/lib/types';

export function useShoppingList() {
  const householdId = useHouseholdId();

  return useQuery({
    queryKey: ['shopping', householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<ShoppingListItem[]> => {
      const { data, error } = await supabase
        .from('shopping_list_items')
        .select(
          'id, household_id, ingredient_id, free_text, quantity, unit, is_checked, added_by, from_recipe_id, created_at, ingredient:ingredients(*)',
        )
        .eq('household_id', householdId!)
        .order('is_checked')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ShoppingListItem[];
    },
  });
}

export function useAddShoppingItem() {
  const householdId = useHouseholdId();
  const { userId } = useSession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      ingredientId?: string | null;
      freeText?: string | null;
      quantity?: number | null;
      unit?: string | null;
    }) => {
      const { error } = await supabase.from('shopping_list_items').insert({
        household_id: householdId,
        ingredient_id: input.ingredientId ?? null,
        free_text: input.freeText ?? null,
        quantity: input.quantity ?? null,
        unit: input.unit ?? null,
        added_by: userId,
      });
      // A partial unique index stops the same ingredient being added twice
      // while still unchecked. Treat that as a no-op, not a failure.
      if (error && error.code !== '23505') throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shopping', householdId] }),
  });
}

export function useToggleShoppingItem() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; isChecked: boolean }) => {
      const { error } = await supabase
        .from('shopping_list_items')
        .update({ is_checked: !input.isChecked })
        .eq('id', input.id);
      if (error) throw error;
    },
    // Ticking things off a list wants to feel instant, so update the cache
    // before the round trip and roll back if the write fails.
    onMutate: async (input) => {
      const key = ['shopping', householdId];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ShoppingListItem[]>(key);
      queryClient.setQueryData<ShoppingListItem[]>(key, (old) =>
        (old ?? []).map((i) => (i.id === input.id ? { ...i, is_checked: !input.isChecked } : i)),
      );
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(['shopping', householdId], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['shopping', householdId] }),
  });
}

export function useRemoveShoppingItem() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('shopping_list_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shopping', householdId] }),
  });
}

export function useClearChecked() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('shopping_list_items')
        .delete()
        .eq('household_id', householdId!)
        .eq('is_checked', true);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shopping', householdId] }),
  });
}

/** Move everything ticked off the list into the pantry in one go. */
export function useMoveCheckedToPantry() {
  const householdId = useHouseholdId();
  const { userId } = useSession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (items: ShoppingListItem[]): Promise<number> => {
      const withIngredient = items.filter((i) => i.is_checked && i.ingredient_id);
      if (withIngredient.length === 0) return 0;

      // One row per ingredient: a single upsert that names the same pantry row
      // twice fails outright ("cannot affect row a second time"), and a list
      // can hold two ticked rows for one ingredient.
      const byIngredient = new Map(withIngredient.map((i) => [i.ingredient_id, i]));

      const { error } = await supabase.from('pantry_items').upsert(
        [...byIngredient.values()].map((i) => ({
          household_id: householdId,
          ingredient_id: i.ingredient_id,
          quantity: i.quantity,
          unit: i.unit,
          source: 'manual' as const,
          added_by: userId,
          added_at: new Date().toISOString(),
        })),
        { onConflict: 'household_id,ingredient_id' },
      );
      if (error) throw error;

      await supabase
        .from('household_staple_optouts')
        .delete()
        .eq('household_id', householdId!)
        .in('ingredient_id', withIngredient.map((i) => i.ingredient_id as string));

      const { error: delError } = await supabase
        .from('shopping_list_items')
        .delete()
        .in('id', withIngredient.map((i) => i.id));
      if (delError) throw delError;

      return withIngredient.length;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopping', householdId] });
      queryClient.invalidateQueries({ queryKey: ['pantry', householdId] });
      queryClient.invalidateQueries({ queryKey: ['staple-optouts', householdId] });
      queryClient.invalidateQueries({ queryKey: ['matches', householdId] });
    },
  });
}
