import type { HealthDay } from '@aura-fit/health-core';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { useServices } from '@/services';

import type { HealthState } from './controller';

interface HealthValue {
  /** undefined while the first check runs. */
  state: HealthState | undefined;
  /** Today's totals when connected; null otherwise. */
  today: HealthDay | null;
  busy: boolean;
  connect: () => Promise<HealthState>;
  disconnect: () => Promise<void>;
  openSettings: () => Promise<void>;
  refresh: () => Promise<void>;
}

const HealthContext = createContext<HealthValue | null>(null);

export function HealthProvider({ children }: { children: ReactNode }) {
  const { health } = useServices();
  // Signing out turns Health off, and the next person starts from there: check again whenever
  // the signed-in user changes.
  const userId = useAuth().session?.user.id;
  const [state, setState] = useState<HealthState | undefined>(undefined);
  const [today, setToday] = useState<HealthDay | null>(null);
  const [busy, setBusy] = useState(false);

  // Checks can overlap (the app comes to the foreground while a connect is in flight). Each
  // one takes a number, and only the newest may set the state.
  const latest = useRef(0);

  const apply = useCallback(
    async (action: () => Promise<HealthState>): Promise<HealthState> => {
      const ticket = ++latest.current;
      const next = await action();
      const day = next === 'connected' ? await health.readToday() : null;
      if (ticket === latest.current) {
        setState(next);
        setToday(day);
      }
      return next;
    },
    [health],
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

  const value = useMemo<HealthValue>(
    () => ({
      state,
      today,
      busy,
      connect: () => run(() => health.connect()),
      disconnect: async () => {
        await run(() => health.disconnect());
      },
      openSettings: () => health.openSettings(),
      refresh,
    }),
    [state, today, busy, run, health, refresh],
  );
  return <HealthContext.Provider value={value}>{children}</HealthContext.Provider>;
}

export function useHealth(): HealthValue {
  const value = useContext(HealthContext);
  if (!value) throw new Error('useHealth must be used inside HealthProvider');
  return value;
}
