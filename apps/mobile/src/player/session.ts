/**
 * A workout session as a state machine, free of React and timers: the screen feeds it time
 * and presses, and reads what to show. Time only passes while the session is active, so a
 * paused session neither counts down nor accrues work.
 */

import type { WorkoutDay } from '@aura-fit/health-core';

export type Step =
  | { kind: 'work'; exerciseId: string; set: number; sets: number; unit: 'reps' | 'seconds'; amount: number }
  | { kind: 'rest'; seconds: number; nextExerciseId: string };

export interface Session {
  steps: Step[];
  index: number;
  status: 'ready' | 'active' | 'paused' | 'done';
  /** Time spent in the current step while active. */
  stepMs: number;
  /** Time spent working (not resting), per exercise. */
  workMsByExercise: Record<string, number>;
  setsDone: Record<string, number>;
  /** Active time over the whole session, work and rest, without pauses. */
  totalMs: number;
  startedAt: number | null;
  finishedAt: number | null;
}

/** The day as a flat list of steps: every set of every item, with its rest in between. */
export function buildSteps(day: WorkoutDay, unitOf: (exerciseId: string) => 'reps' | 'seconds' | undefined): Step[] {
  const work: (Extract<Step, { kind: 'work' }> & { rest: number })[] = [];
  for (const block of day.blocks) {
    for (const item of block.items) {
      for (let set = 1; set <= item.sets; set++) {
        work.push({
          kind: 'work',
          exerciseId: item.exercise_id,
          set,
          sets: item.sets,
          unit: unitOf(item.exercise_id) ?? 'reps',
          amount: item.amount,
          rest: item.rest_seconds ?? 0,
        });
      }
    }
  }
  const steps: Step[] = [];
  work.forEach(({ rest, ...step }, i) => {
    steps.push(step);
    const next = work[i + 1];
    if (next && rest > 0) steps.push({ kind: 'rest', seconds: rest, nextExerciseId: next.exerciseId });
  });
  return steps;
}

/** A Done press this soon after a set began is the previous tap arriving twice, not a set. */
export const MIN_SET_MS = 500;

export function createSession(steps: Step[]): Session {
  return { steps, index: 0, status: 'ready', stepMs: 0, workMsByExercise: {}, setsDone: {}, totalMs: 0, startedAt: null, finishedAt: null };
}

export const currentStep = (session: Session): Step | undefined => session.steps[session.index];

/** How long a step runs by the clock; undefined for reps, which end when the user says so. */
export function stepDurationMs(step: Step): number | undefined {
  if (step.kind === 'rest') return step.seconds * 1000;
  return step.unit === 'seconds' ? step.amount * 1000 : undefined;
}

/** Whole seconds left in a timed step, for display. */
export function secondsLeft(session: Session): number | undefined {
  const step = currentStep(session);
  const duration = step ? stepDurationMs(step) : undefined;
  return duration === undefined ? undefined : Math.max(0, Math.ceil((duration - session.stepMs) / 1000));
}

export type Action =
  | { type: 'start'; now: number }
  /** Time passed while the screen was showing the session. */
  | { type: 'tick'; ms: number; now: number }
  /** The user finished the current set, or ended a rest early. */
  | { type: 'complete'; now: number }
  /** The user skipped the current set: it does not count as done. */
  | { type: 'skip'; now: number }
  | { type: 'pause' }
  | { type: 'resume' }
  /** End the session now, keeping what was done. */
  | { type: 'finish'; now: number };

function leaveStep(session: Session, counted: boolean, now: number): Session {
  const step = currentStep(session);
  if (!step) return session;
  const next: Session = { ...session, index: session.index + 1, stepMs: 0 };
  if (step.kind === 'work') {
    next.workMsByExercise = {
      ...session.workMsByExercise,
      [step.exerciseId]: (session.workMsByExercise[step.exerciseId] ?? 0) + session.stepMs,
    };
    if (counted) next.setsDone = { ...session.setsDone, [step.exerciseId]: (session.setsDone[step.exerciseId] ?? 0) + 1 };
  }
  if (next.index >= next.steps.length) {
    next.status = 'done';
    next.finishedAt = now;
  }
  return next;
}

export function reduce(session: Session, action: Action): Session {
  switch (action.type) {
    case 'start':
      return session.status === 'ready' && session.steps.length > 0 ? { ...session, status: 'active', startedAt: action.now } : session;

    case 'pause':
      return session.status === 'active' ? { ...session, status: 'paused' } : session;

    case 'resume':
      return session.status === 'paused' ? { ...session, status: 'active' } : session;

    case 'tick': {
      if (session.status !== 'active' || !(action.ms > 0)) return session;
      let left = action.ms;
      let state = session;
      // One tick can cross several timed steps (the app was in the background for a while).
      while (left > 0 && state.status === 'active') {
        const step = currentStep(state) as Step;
        const duration = stepDurationMs(step);
        const room = duration === undefined ? left : Math.max(0, duration - state.stepMs);
        const used = Math.min(left, room);
        state = { ...state, stepMs: state.stepMs + used, totalMs: state.totalMs + used };
        left -= used;
        if (duration === undefined) break; // reps wait for the user, however long that takes
        if (state.stepMs >= duration) state = leaveStep(state, true, action.now);
      }
      return state;
    }

    case 'complete': {
      if (session.status !== 'active') return session;
      if (currentStep(session)?.kind === 'work' && session.stepMs < MIN_SET_MS) return session;
      return leaveStep(session, true, action.now);
    }

    case 'skip':
      return session.status === 'active' ? leaveStep(session, false, action.now) : session;

    case 'finish': {
      if (session.status !== 'active' && session.status !== 'paused') return session;
      // Time already spent in an unfinished set still counts as work; the set does not count as done.
      const step = currentStep(session);
      const workMsByExercise =
        step?.kind === 'work'
          ? { ...session.workMsByExercise, [step.exerciseId]: (session.workMsByExercise[step.exerciseId] ?? 0) + session.stepMs }
          : session.workMsByExercise;
      return { ...session, workMsByExercise, stepMs: 0, status: 'done', finishedAt: action.now };
    }
  }
}

export interface SessionSummary {
  exercises_completed: { exercise_id: string; sets_done: number }[];
  duration_minutes: number;
  /** Time the session was running, work and rest, without pauses. */
  activeMs: number;
  startedAt: number;
  finishedAt: number;
  workMsByExercise: Record<string, number>;
}

/** What a finished session amounts to; null until it is done, and when nothing at all was done. */
export function summarize(session: Session): SessionSummary | null {
  if (session.status !== 'done' || session.startedAt === null || session.finishedAt === null) return null;
  const exercises_completed = Object.entries(session.setsDone)
    .filter(([, sets]) => sets > 0)
    .map(([exercise_id, sets_done]) => ({ exercise_id, sets_done }));
  if (exercises_completed.length === 0) return null;
  return {
    exercises_completed,
    duration_minutes: Math.max(1, Math.round(session.totalMs / 60_000)),
    activeMs: session.totalMs,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    workMsByExercise: session.workMsByExercise,
  };
}
