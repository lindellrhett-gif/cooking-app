import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useHouseholdId, useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { Ingredient, UserPreferences } from '@/lib/types';

export function usePreferences() {
  const { userId } = useSession();

  return useQuery({
    queryKey: ['preferences', userId],
    enabled: !!userId,
    queryFn: async (): Promise<UserPreferences | null> => {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data as UserPreferences | null;
    },
  });
}

export function useUpdatePreferences() {
  const { userId } = useSession();
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: Partial<Omit<UserPreferences, 'user_id'>>) => {
      const { error } = await supabase.from('user_preferences').upsert(
        { user_id: userId, ...patch, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preferences', userId] });
      // Preferences filter and rank the results, so the Cook screen changes.
      queryClient.invalidateQueries({ queryKey: ['matches', householdId] });
    },
  });
}

/**
 * Resolve the ingredient ids stored in preferences back to names, so the
 * settings screen can show "Peanuts" rather than a UUID.
 */
export function useIngredientsByIds(ids: string[]) {
  const key = [...ids].sort().join(',');

  return useQuery({
    queryKey: ['ingredients-by-id', key],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Ingredient[]> => {
      const { data, error } = await supabase.from('ingredients').select('*').in('id', ids);
      if (error) throw error;
      return (data ?? []) as Ingredient[];
    },
    staleTime: 1000 * 60 * 60,
  });
}
