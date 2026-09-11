import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

interface SessionValue {
  session: Session | null;
  /** Null until the initial session lookup finishes. Distinguishes "signed out" from "not known yet". */
  initialising: boolean;
  userId: string | null;
}

const SessionContext = createContext<SessionValue>({
  session: null,
  initialising: true,
  userId: null,
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initialising, setInitialising] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => setSession(null))
      // Must run either way. Leaving initialising true on a failed lookup
      // strands the app on its loading screen with nothing to explain why.
      .finally(() => setInitialising(false));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Everything cached is scoped to a user and a household. Signing in or
      // out has to drop it or the next account sees the previous one's pantry.
      queryClient.clear();
    });

    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  return (
    <SessionContext.Provider
      value={{ session, initialising, userId: session?.user.id ?? null }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);

export function useProfile() {
  const { userId } = useSession();

  return useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, active_household_id')
        .eq('id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });
}

/**
 * The household whose pantry and list we are looking at. Everything
 * household-scoped waits on this, so screens should treat null as "not ready"
 * rather than "no household".
 */
export function useHouseholdId(): string | null {
  const { data } = useProfile();
  return data?.active_household_id ?? null;
}
