import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useHouseholdId } from '@/lib/session';
import { supabase } from '@/lib/supabase';

/**
 * Keeps two phones in one kitchen in sync.
 *
 * Subscribes to the household's pantry and shopping list and invalidates the
 * affected queries when anything changes. This is deliberately coarse: it
 * refetches rather than trying to apply the change payload to the cache, which
 * would mean reimplementing the join to ingredients on the client and getting
 * it subtly wrong.
 *
 * Realtime must be enabled for these tables in the Supabase dashboard under
 * Database, Replication. Without that the app still works, it just stops
 * updating on its own.
 */
export function useHouseholdRealtime() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!householdId) return;

    const filter = `household_id=eq.${householdId}`;

    const channel = supabase
      .channel(`household:${householdId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pantry_items', filter },
        () => {
          queryClient.invalidateQueries({ queryKey: ['pantry', householdId] });
          queryClient.invalidateQueries({ queryKey: ['matches', householdId] });
          queryClient.invalidateQueries({ queryKey: ['recipe-availability'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_list_items', filter },
        () => {
          queryClient.invalidateQueries({ queryKey: ['shopping', householdId] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'household_staple_optouts', filter },
        () => {
          queryClient.invalidateQueries({ queryKey: ['staple-optouts', householdId] });
          queryClient.invalidateQueries({ queryKey: ['matches', householdId] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [householdId, queryClient]);
}
