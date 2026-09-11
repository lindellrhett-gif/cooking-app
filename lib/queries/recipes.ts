import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useHouseholdId, useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { MatchedRecipe, Recipe, RecipeIngredientLine } from '@/lib/types';

/**
 * What can we cook right now.
 *
 * maxMissing of 2 gives both tiers in one call: zero missing is "ready to
 * cook", one or two is "almost there".
 */
export function useMatches(maxMissing = 2) {
  const householdId = useHouseholdId();

  return useQuery({
    queryKey: ['matches', householdId, maxMissing],
    enabled: !!householdId,
    queryFn: async (): Promise<MatchedRecipe[]> => {
      const { data, error } = await supabase.rpc('match_recipes', {
        p_household_id: householdId,
        p_max_missing: maxMissing,
      });
      if (error) throw error;
      return (data ?? []) as MatchedRecipe[];
    },
  });
}

export function useRecipe(recipeId: string | undefined) {
  return useQuery({
    queryKey: ['recipe', recipeId],
    enabled: !!recipeId,
    queryFn: async (): Promise<Recipe | null> => {
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', recipeId!)
        .maybeSingle();
      if (error) throw error;
      return data as Recipe | null;
    },
    staleTime: 1000 * 60 * 60,
  });
}

/** Recipe ingredients with a have/missing mark against the household pantry. */
export function useRecipeAvailability(recipeId: string | undefined) {
  const householdId = useHouseholdId();

  return useQuery({
    queryKey: ['recipe-availability', householdId, recipeId],
    enabled: !!householdId && !!recipeId,
    queryFn: async (): Promise<RecipeIngredientLine[]> => {
      const { data, error } = await supabase.rpc('recipe_with_availability', {
        p_household_id: householdId,
        p_recipe_id: recipeId,
      });
      if (error) throw error;
      return (data ?? []) as RecipeIngredientLine[];
    },
  });
}

export function useFavorites() {
  const { userId } = useSession();

  return useQuery({
    queryKey: ['favorites', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Recipe[]> => {
      const { data, error } = await supabase
        .from('favorites')
        .select('created_at, recipe:recipes(*)')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => r.recipe).filter(Boolean) as Recipe[];
    },
  });
}

export function useToggleFavorite() {
  const { userId } = useSession();
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { recipeId: string; isFavorite: boolean }) => {
      if (input.isFavorite) {
        const { error } = await supabase
          .from('favorites')
          .delete()
          .eq('user_id', userId!)
          .eq('recipe_id', input.recipeId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('favorites')
          .upsert({ user_id: userId, recipe_id: input.recipeId }, { onConflict: 'user_id,recipe_id' });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites', userId] });
      // Favorites are boosted in the match ranking, so the order changes too.
      queryClient.invalidateQueries({ queryKey: ['matches', householdId] });
    },
  });
}

export function useLogCooked() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recipeId: string) => {
      const { error } = await supabase.rpc('log_cooked', {
        p_household_id: householdId,
        p_recipe_id: recipeId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // Recently cooked dishes drop down the ranking.
      queryClient.invalidateQueries({ queryKey: ['matches', householdId] });
    },
  });
}

export function useAddMissingToList() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recipeId: string): Promise<number> => {
      const { data, error } = await supabase.rpc('add_recipe_missing_to_list', {
        p_household_id: householdId,
        p_recipe_id: recipeId,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shopping', householdId] }),
  });
}
