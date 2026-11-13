import { addDays, type HealthDay } from '@aura-fit/health-core';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { useServices } from '@/services';

import type { HealthState } from './controller';
import { createHealthSync, HISTORY_DAYS } from './sync';


interface HealthValue {
  /** undefined while the first check runs. */
  state: HealthState | undefined;
  /** Today's totals when connected; null otherwise. */
  today: HealthDay | null;
  /** Today and the 14 days before it, oldest first; empty when not connected. */
  days: HealthDay[];
  busy: boolean;
  connect: () => Promise<HealthState>;
  disconnect: () => Promise<void>;
  openSettings: () => Promise<void>;
  refresh: () => Promise<void>;
}

const HealthContext = createContext<HealthValue | null>(null);

export function HealthProvider({ children }: { children: ReactNode }) {
  const { health, supabase, today: todayOf } = useServices();
  // Signing out turns Health off, and the next person starts from there: check again whenever
  // the signed-in user changes.
  const userId = useAuth().session?.user.id;
  const [state, setState] = useState<HealthState | undefined>(undefined);
  const [days, setDays] = useState<HealthDay[]>([]);
  const sync = useMemo(() => createHealthSync(supabase), [supabase]);
  const [busy, setBusy] = useState(false);

  // Checks can overlap (the app comes to the foreground while a connect is in flight). Each
  // one takes a number, and only the newest may set the state.
  const latest = useRef(0);

  const apply = useCallback(
    async (action: () => Promise<HealthState>): Promise<HealthState> => {
      const ticket = ++latest.current;
      const next = await action();
      if (ticket !== latest.current) return next;
      // The status is shown at once; the 15-day read can take a moment.
      setState(next);
      if (next !== 'connected') {
        setDays([]);
        if (userId) sync.forget(userId);
        return next;
      }
      const to = todayOf();
      let read: { days: HealthDay[]; complete: boolean };
      try {
        read = await health.readDaysChecked(addDays(to, -HISTORY_DAYS), to);
      } catch {
        read = { days: [], complete: false };
      }
      if (ticket === latest.current) {
        setDays(read.days);
        // The same days go to the server as daily summaries, but only from a read in which
        // nothing failed: a failed read looks like "no data" and would erase what is stored.
        // Never awaited: a failed sync is simply tried again on the next check.
        if (read.complete && userId) void sync(userId, read.days);
      }
      return next;
    },
    [health, todayOf, sync, userId],
  );

  const refresh = useCallback(async () => {
    await apply(() => health.state());
  }, [apply, health]);

  useEffect(() => {
    let active = true;
    const load = () => {
      apply(() => health.state()).catch(() => active && setState('unavailable'));
    };
    load();
    // Access can change while the app is in the background (the user visits the system settings).
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') load();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [apply, health, userId]);

  const run = useCallback(
    async (action: () => Promise<HealthState>): Promise<HealthState> => {
      setBusy(true);
      try {
        return await apply(action);
      } finally {
        setBusy(false);
      }
    },
    [apply],
  );

  const today = useMemo(() => days.find((day) => day.day === todayOf()) ?? null, [days, todayOf]);

  const value = useMemo<HealthValue>(
    () => ({
      state,
      today,
      days,
      busy,
      connect: () => run(() => health.connect()),
      disconnect: async () => {
        await run(() => health.disconnect());
      },
      openSettings: () => health.openSettings(),
      refresh,
    }),
    [state, today, days, busy, run, health, refresh],
  );
  return <HealthContext.Provider value={value}>{children}</HealthContext.Provider>;
}

export function useHealth(): HealthValue {
  const value = useContext(HealthContext);
  if (!value) throw new Error('useHealth must be used inside HealthProvider');
  return value;
}
