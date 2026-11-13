import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useHealth } from '@/health/HealthProvider';
import { useServices } from '@/services';

import type { NudgeChoices, NudgeStatus } from './controller';

interface NudgeValue {
  /** undefined until the first refresh answered. */
  status: NudgeStatus | undefined;
  busy: boolean;
  turnOn: () => Promise<void>;
  turnOff: () => Promise<void>;
  save: (choices: NudgeChoices) => Promise<void>;
  /** A workout or break is opened: waiting nudges are cancelled and none is planned until it ends. */
  hold: () => Promise<void>;
  /** It was closed without being started. */
  release: () => Promise<void>;
  /** A workout or break ended: no nudge for the next hour. */
  moved: () => Promise<void>;
}

const NudgeContext = createContext<NudgeValue | null>(null);

/** Keeps the scheduled sitting nudges in step with the steps the health store reports while the app is open. */
export function NudgeProvider({ children }: { children: ReactNode }) {
  const { nudges, health } = useServices();
  const healthState = useHealth().state;
  const [status, setStatus] = useState<NudgeStatus | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const apply = useCallback(async (action: () => Promise<NudgeStatus>) => {
    const next = await action();
    if (mounted.current) setStatus(next);
  }, []);

  // Planned again when the app comes forward, when Health is connected or disconnected, and
  // when the phone delivers new steps.
  useEffect(() => {
    if (healthState === undefined) return;
    const refresh = () => void apply(() => nudges.refresh());
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    const stopWatching = healthState === 'connected' ? health.watchSteps(refresh) : () => {};
    return () => {
      subscription.remove();
      stopWatching();
    };
  }, [apply, nudges, health, healthState]);

  const run = useCallback(
    async (action: () => Promise<NudgeStatus>) => {
      setBusy(true);
      try {
        await apply(action);
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [apply],
  );

  // Stable, because the player calls them from an effect.
  const hold = useCallback(() => nudges.hold(), [nudges]);
  const moved = useCallback(() => apply(() => nudges.moved()), [apply, nudges]);
  const release = useCallback(() => apply(() => nudges.release()), [apply, nudges]);

  const value = useMemo<NudgeValue>(
    () => ({
      status,
      busy,
      turnOn: () => run(() => nudges.turnOn()),
      turnOff: () => run(() => nudges.turnOff()),
      save: (choices) => run(() => nudges.save(choices)),
      hold,
      release,
      moved,
    }),
    [status, busy, run, nudges, hold, release, moved],
  );

  return <NudgeContext.Provider value={value}>{children}</NudgeContext.Provider>;
}

export function useNudges(): NudgeValue {
  const value = useContext(NudgeContext);
  if (!value) throw new Error('useNudges must be used inside NudgeProvider');
  return value;
}
