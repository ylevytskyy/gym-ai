import { useEffect } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { create } from "zustand";

import { supabase } from "@src/lib/supabase";

export type AuthStatus = "loading" | "signed-in" | "signed-out";

interface AuthState {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  setSession: (session: Session | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  session: null,
  user: null,
  setSession: (session) =>
    set({
      session,
      user: session?.user ?? null,
      status: session ? "signed-in" : "signed-out",
    }),
}));

let initialized = false;

// Initializes once per JS runtime: hydrates from stored session, then
// subscribes for the lifetime of the app. The subscription handle is
// intentionally retained — there is no point in tearing it down.
export function initAuth(): void {
  if (initialized) return;
  initialized = true;

  const setSession = useAuthStore.getState().setSession;

  void supabase.auth.getSession().then(({ data }) => {
    setSession(data.session);
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session);
  });
}

export function useInitAuth(): void {
  useEffect(() => {
    initAuth();
  }, []);
}
