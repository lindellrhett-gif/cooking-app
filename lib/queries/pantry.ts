import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useHouseholdId, useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { Ingredient, PantryItem } from '@/lib/types';

export const pantryKey = (householdId: string | null) => ['pantry', householdId];

export function usePantry() {
  const householdId = useHouseholdId();

  return useQuery({
    queryKey: pantryKey(householdId),
    enabled: !!householdId,
    queryFn: async (): Promise<PantryItem[]> => {
      const { data, error } = await supabase
        .from('pantry_items')
        .select(
          'id, household_id, ingredient_id, quantity, unit, source, added_by, added_at, expires_on, ingredient:ingredients(*)',
        )
        .eq('household_id', householdId!)
        .order('added_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PantryItem[];
    },
  });
}

/** Staples the household has explicitly marked as run out. */
export function useStapleOptOuts() {
  const householdId = useHouseholdId();

  return useQuery({
    queryKey: ['staple-optouts', householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('household_staple_optouts')
        .select('ingredient_id')
        .eq('household_id', householdId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.ingredient_id as string);
    },
  });
}

export function useAddPantryItem() {
  const householdId = useHouseholdId();
  const { userId } = useSession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { ingredientId: string; quantity?: number | null; unit?: string | null }) => {
      // One row per ingredient per household, so buying more of something
      // updates the existing row rather than creating a second one.
      const { error } = await supabase.from('pantry_items').upsert(
        {
          household_id: householdId,
          ingredient_id: input.ingredientId,
          quantity: input.quantity ?? null,
          unit: input.unit ?? null,
          source: 'manual',
          added_by: userId,
          added_at: new Date().toISOString(),
        },
        { onConflict: 'household_id,ingredient_id' },
      );
      if (error) throw error;

      // Adding something back means you are no longer out of it.
      await supabase
        .from('household_staple_optouts')
        .delete()
        .eq('household_id', householdId!)
        .eq('ingredient_id', input.ingredientId);
    },
    onSuccess: () => invalidatePantryDependents(queryClient, householdId),
  });
}

export function useUpdatePantryItem() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; quantity: number | null; unit: string | null }) => {
      const { error } = await supabase
        .from('pantry_items')
        .update({ quantity: input.quantity, unit: input.unit })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pantryKey(householdId) }),
  });
}

export function useRemovePantryItem() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (item: { id: string; ingredient_id: string; is_staple: boolean }) => {
      const { error } = await supabase.from('pantry_items').delete().eq('id', item.id);
      if (error) throw error;

      // Deleting a staple row is not enough on its own: staples are assumed
      // present, so it would immediately count as in stock again. Record the
      // opt-out as well.
      if (item.is_staple) {
        await supabase
          .from('household_staple_optouts')
          .upsert(
            { household_id: householdId, ingredient_id: item.ingredient_id },
            { onConflict: 'household_id,ingredient_id' },
          );
      }
    },
    onSuccess: () => invalidatePantryDependents(queryClient, householdId),
  });
}

/** Mark a staple as out of stock, or back in stock, without a pantry row. */
export function useSetStapleStock() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { ingredientId: string; inStock: boolean }) => {
      if (input.inStock) {
        const { error } = await supabase
          .from('household_staple_optouts')
          .delete()
          .eq('household_id', householdId!)
          .eq('ingredient_id', input.ingredientId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('household_staple_optouts').upsert(
          { household_id: householdId, ingredient_id: input.ingredientId },
          { onConflict: 'household_id,ingredient_id' },
        );
        if (error) throw error;
      }
    },
    onSuccess: () => invalidatePantryDependents(queryClient, householdId),
  });
}

/** Ingredient autocomplete, backed by the alias-aware search function. */
export function useIngredientSearch(query: string) {
  return useQuery({
    queryKey: ['ingredient-search', query],
    queryFn: async (): Promise<Ingredient[]> => {
      const { data, error } = await supabase.rpc('search_ingredients', {
        p_query: query,
        p_limit: 30,
      });
      if (error) throw error;
      return (data ?? []) as Ingredient[];
    },
  });
}

export function useAllStaples() {
  return useQuery({
    queryKey: ['staples'],
    queryFn: async (): Promise<Ingredient[]> => {
      const { data, error } = await supabase
        .from('ingredients')
        .select('*')
        .eq('is_staple', true)
        .order('category')
        .order('display_name');
      if (error) throw error;
      return (data ?? []) as Ingredient[];
    },
    // Reference data. It only changes when the seed script runs.
    staleTime: 1000 * 60 * 60,
  });
}

/**
 * Anything that changes the pantry changes what you can cook, so the match
 * results have to go too. Forgetting this is the classic stale-UI bug here.
 */
function invalidatePantryDependents(
  queryClient: ReturnType<typeof useQueryClient>,
  householdId: string | null,
) {
  queryClient.invalidateQueries({ queryKey: pantryKey(householdId) });
  queryClient.invalidateQueries({ queryKey: ['staple-optouts', householdId] });
  queryClient.invalidateQueries({ queryKey: ['matches', householdId] });
  queryClient.invalidateQueries({ queryKey: ['recipe-availability'] });
}
