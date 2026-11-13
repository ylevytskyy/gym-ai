import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useServices } from '@/services';

interface AuthValue {
  /** undefined while the stored session is being read. */
  session: Session | null | undefined;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { supabase, health } = useServices();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => active && setSession(data.session))
      .catch(() => active && setSession(null));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => active && setSession(next));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      signOut: async () => {
        // The health choice belongs to the person who made it: the next person to sign in on
        // this phone starts with Health off.
        await health.disconnect();
        await supabase.auth.signOut();
      },
    }),
    [session, supabase, health],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
