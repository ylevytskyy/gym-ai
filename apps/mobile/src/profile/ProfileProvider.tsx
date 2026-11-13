import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { deviceTimeZone } from '@/health/local-day';
import { useServices } from '@/services';

import type { ProfileValues } from './model';
import { loadProfile, saveProfile, saveTimeZone, type StoredProfile } from './repository';

type ProfileState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; profile: StoredProfile }
  | { status: 'error'; message: string };

interface ProfileValue {
  state: ProfileState;
  save: (values: ProfileValues) => Promise<void>;
  reload: () => void;
  /** Loads the profile again in place, after something else changed it (the coach added an injury). */
  refresh: () => Promise<void>;
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

  // The server counts the AI allowance in the user's local day, so it needs the device time zone.
  // Written after sign-in or onboarding, and again whenever a loaded profile has another one.
  // Tried once per user and zone: a refused name must not loop.
  const zoneTried = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || key === null || state.status !== 'ready') return;
    const zone = deviceTimeZone();
    if (state.profile.timezone === zone || zoneTried.current === `${userId}:${zone}`) return;
    zoneTried.current = `${userId}:${zone}`;
    saveTimeZone(supabase, userId, zone)
      .then((profile) => setLoaded((current) => (current?.key === key ? { key, state: { status: 'ready', profile } } : current)))
      .catch(() => {
        // The server keeps counting in the zone it has; the next launch tries again.
      });
  }, [supabase, userId, key, state]);

  const save = useCallback(
    async (values: ProfileValues) => {
      if (!userId) throw new Error('Sign in first.');
      const profile = await saveProfile(supabase, userId, values);
      if (key !== null) setLoaded({ key, state: { status: 'ready', profile } });
    },
    [supabase, userId, key],
  );

  // Loads the profile again without showing "loading": the screens stay where they are.
  const refresh = useCallback(async () => {
    if (!userId || key === null) return;
    try {
      const profile = await loadProfile(supabase, userId);
      if (profile) setLoaded((current) => (current?.key === key ? { key, state: { status: 'ready', profile } } : current));
    } catch {
      // What is shown stays; the next launch loads it again.
    }
  }, [supabase, userId, key]);

  const value = useMemo<ProfileValue>(() => ({ state, save, reload: () => setAttempt((n) => n + 1), refresh }), [state, save, refresh]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileValue {
  const value = useContext(ProfileContext);
  if (!value) throw new Error('useProfile must be used inside ProfileProvider');
  return value;
}
