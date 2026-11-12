import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { useServices } from '@/services';

import type { ProfileValues } from './model';
import { loadProfile, saveProfile, type StoredProfile } from './repository';

type ProfileState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; profile: StoredProfile }
  | { status: 'error'; message: string };

interface ProfileValue {
  state: ProfileState;
  save: (values: ProfileValues) => Promise<void>;
  reload: () => void;
}

const ProfileContext = createContext<ProfileValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { supabase } = useServices();
  const { session } = useAuth();
  const userId = session?.user.id;
  // What was loaded, and for which user and attempt. Anything else is still loading, so a
  // different user never sees the previous user's profile.
  const [loaded, setLoaded] = useState<{ key: string; state: ProfileState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = userId ? `${userId}:${attempt}` : null;
  const state = useMemo<ProfileState>(
    () => (key !== null && loaded?.key === key ? loaded.state : { status: 'loading' }),
    [key, loaded],
  );

  useEffect(() => {
    if (!userId || key === null) return;
    let active = true;
    loadProfile(supabase, userId)
      .then((profile) => active && setLoaded({ key, state: profile ? { status: 'ready', profile } : { status: 'missing' } }))
      .catch(
        (error: unknown) =>
          active &&
          setLoaded({ key, state: { status: 'error', message: error instanceof Error ? error.message : 'Could not load your profile.' } }),
      );
    return () => {
      active = false;
    };
  }, [supabase, userId, key]);

  const save = useCallback(
    async (values: ProfileValues) => {
      if (!userId) throw new Error('Sign in first.');
      const profile = await saveProfile(supabase, userId, values);
      if (key !== null) setLoaded({ key, state: { status: 'ready', profile } });
    },
    [supabase, userId, key],
  );

  const value = useMemo<ProfileValue>(() => ({ state, save, reload: () => setAttempt((n) => n + 1) }), [state, save]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileValue {
  const value = useContext(ProfileContext);
  if (!value) throw new Error('useProfile must be used inside ProfileProvider');
  return value;
}
