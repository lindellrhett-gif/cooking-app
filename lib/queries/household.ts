import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useHouseholdId, useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { Household, HouseholdMember } from '@/lib/types';

export function useHousehold() {
  const householdId = useHouseholdId();

  return useQuery({
    queryKey: ['household', householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<Household | null> => {
      const { data, error } = await supabase
        .from('households')
        .select('*')
        .eq('id', householdId!)
        .maybeSingle();
      if (error) throw error;
      return data as Household | null;
    },
  });
}

export function useHouseholdMembers() {
  const householdId = useHouseholdId();

  return useQuery({
    queryKey: ['household-members', householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<HouseholdMember[]> => {
      const { data, error } = await supabase
        .from('household_members')
        .select('household_id, user_id, role, joined_at, profile:profiles(id, display_name)')
        .eq('household_id', householdId!)
        .order('joined_at');
      if (error) throw error;
      return (data ?? []) as unknown as HouseholdMember[];
    },
  });
}

/**
 * Creating and joining both go through security-definer functions, because
 * joining means reading a household you are not yet a member of.
 */
export function useCreateHousehold() {
  const { userId } = useSession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string): Promise<string> => {
      const { data, error } = await supabase.rpc('create_household', { p_name: name });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile', userId] }),
  });
}

export function useJoinHousehold() {
  const { userId } = useSession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inviteCode: string): Promise<string> => {
      const { data, error } = await supabase.rpc('join_household', {
        p_invite_code: inviteCode,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile', userId] }),
  });
}

export function useLeaveHousehold() {
  const householdId = useHouseholdId();
  const { userId } = useSession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('household_members')
        .delete()
        .eq('household_id', householdId!)
        .eq('user_id', userId!);
      if (error) throw error;

      // The profile still points at a household we can no longer read, which
      // would leave every household query failing rather than empty.
      await supabase.from('profiles').update({ active_household_id: null }).eq('id', userId!);
    },
    onSuccess: () => queryClient.clear(),
  });
}

export function useUpdateDisplayName() {
  const { userId } = useSession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (displayName: string) => {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName.trim() })
        .eq('id', userId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', userId] });
      queryClient.invalidateQueries({ queryKey: ['household-members'] });
    },
  });
}
