import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { useServices } from '@/services';

import type { StoredPlan, WorkoutLogRow } from './model';
import { loadActivePlan, loadPlanLogs, PlanError, requestPlan } from './repository';

type PlanState =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'ready'; stored: StoredPlan; logs: WorkoutLogRow[] }
  | { status: 'error'; message: string };

interface PlanValue {
  state: PlanState;
  creating: boolean;
  createError: string | undefined;
  /** Asks the assistant service for a new plan. */
  create: () => Promise<void>;
  reload: () => void;
  /** Called after a session was saved, so Today shows it as done without a round trip. */
  addLog: (log: WorkoutLogRow) => void;
}

const PlanContext = createContext<PlanValue | null>(null);

/** Days in a newly made plan. One plan type for now; the README says to start small. */
const PLAN_DAYS = 3;

export function PlanProvider({ children }: { children: ReactNode }) {
  const services = useServices();
  const { supabase } = services;
  const { session } = useAuth();
  const userId = session?.user.id;
  const token = session?.access_token;

  const [loaded, setLoaded] = useState<{ key: string; state: PlanState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>();
  const key = userId ? `${userId}:${attempt}` : null;
  const state = useMemo<PlanState>(() => (key !== null && loaded?.key === key ? loaded.state : { status: 'loading' }), [key, loaded]);

  useEffect(() => {
    if (!userId || key === null) return;
    let active = true;
    (async () => {
      const stored = await loadActivePlan(supabase, userId);
      if (!stored) return { status: 'none' } as PlanState;
      return { status: 'ready', stored, logs: await loadPlanLogs(supabase, userId, stored.id) } as PlanState;
    })()
      .then((next) => active && setLoaded({ key, state: next }))
      .catch(
        (error: unknown) =>
          active && setLoaded({ key, state: { status: 'error', message: error instanceof PlanError ? error.message : 'Could not load your plan.' } }),
      );
    return () => {
      active = false;
    };
  }, [supabase, userId, key]);

  const create = useCallback(async () => {
    if (!token || key === null || creating) return;
    setCreating(true);
    setCreateError(undefined);
    try {
      const stored = await requestPlan(services.fetch, services.assistantUrl, token, { duration_days: PLAN_DAYS, focus_areas: [] });
      setLoaded({ key, state: { status: 'ready', stored, logs: [] } });
    } catch (error) {
      setCreateError(error instanceof PlanError ? error.message : 'A plan could not be made. Try again.');
    } finally {
      setCreating(false);
    }
  }, [services, token, key, creating]);

  const addLog = useCallback(
    (log: WorkoutLogRow) =>
      setLoaded((current) =>
        current && current.state.status === 'ready' ? { key: current.key, state: { ...current.state, logs: [log, ...current.state.logs] } } : current,
      ),
    [],
  );

  const value = useMemo<PlanValue>(
    () => ({ state, creating, createError, create, reload: () => setAttempt((n) => n + 1), addLog }),
    [state, creating, createError, create, addLog],
  );
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): PlanValue {
  const value = useContext(PlanContext);
  if (!value) throw new Error('usePlan must be used inside PlanProvider');
  return value;
}
