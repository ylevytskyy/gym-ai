import type { WorkoutDay } from '@aura-fit/health-core';

import { buildSteps, createSession, currentStep, reduce, secondsLeft, summarize, type Action, type Session } from './session';

const day: WorkoutDay = {
  day: 1,
  title: 'Short',
  minutes: 5,
  blocks: [
    { type: 'warm_up', items: [{ exercise_id: 'neck-rolls', sets: 1, amount: 30 }] },
    {
      type: 'main',
      items: [
        { exercise_id: 'squat', sets: 2, amount: 10, rest_seconds: 20 },
        { exercise_id: 'plank', sets: 1, amount: 15, rest_seconds: 30 },
      ],
    },
  ],
};
const unitOf = (id: string) => (id === 'squat' ? ('reps' as const) : ('seconds' as const));
const steps = buildSteps(day, unitOf);

const T0 = 1_000_000;
const run = (session: Session, ...actions: Action[]) => actions.reduce(reduce, session);
const started = () => run(createSession(steps), { type: 'start', now: T0 });

describe('buildSteps', () => {
  it('lists every set in order with rests between, and none after the last set', () => {
    expect(steps).toEqual([
      { kind: 'work', exerciseId: 'neck-rolls', set: 1, sets: 1, unit: 'seconds', amount: 30 },
      { kind: 'work', exerciseId: 'squat', set: 1, sets: 2, unit: 'reps', amount: 10 },
      { kind: 'rest', seconds: 20, nextExerciseId: 'squat' },
      { kind: 'work', exerciseId: 'squat', set: 2, sets: 2, unit: 'reps', amount: 10 },
      { kind: 'rest', seconds: 20, nextExerciseId: 'plank' },
      { kind: 'work', exerciseId: 'plank', set: 1, sets: 1, unit: 'seconds', amount: 15 },
    ]);
  });

  it('treats an exercise the catalog does not know as reps, so the user can still move on', () => {
    expect(buildSteps({ ...day, blocks: [{ type: 'main', items: [{ exercise_id: 'mystery', sets: 1, amount: 5 }] }] }, () => undefined)).toEqual([
      { kind: 'work', exerciseId: 'mystery', set: 1, sets: 1, unit: 'reps', amount: 5 },
    ]);
  });
});

describe('session', () => {
  it('does nothing until started, and cannot start an empty day', () => {
    const ready = createSession(steps);
    expect(run(ready, { type: 'tick', ms: 5000, now: T0 }, { type: 'complete', now: T0 })).toEqual(ready);
    expect(reduce(createSession([]), { type: 'start', now: T0 }).status).toBe('ready');
  });

  it('counts a timed set down and moves on by itself', () => {
    let session = run(started(), { type: 'tick', ms: 12_300, now: T0 + 12_300 });
    expect(secondsLeft(session)).toBe(18);
    expect(session.index).toBe(0);

    session = reduce(session, { type: 'tick', ms: 17_700, now: T0 + 30_000 });
    expect(session.index).toBe(1);
    expect(session.setsDone).toEqual({ 'neck-rolls': 1 });
    expect(session.workMsByExercise).toEqual({ 'neck-rolls': 30_000 });
    expect(secondsLeft(session)).toBeUndefined(); // reps have no clock
  });

  it('waits on reps for as long as the user takes, then rests', () => {
    let session = run(started(), { type: 'tick', ms: 30_000, now: T0 }, { type: 'tick', ms: 600_000, now: T0 });
    expect(currentStep(session)).toMatchObject({ exerciseId: 'squat', set: 1 });

    session = reduce(session, { type: 'complete', now: T0 });
    expect(currentStep(session)).toEqual({ kind: 'rest', seconds: 20, nextExerciseId: 'squat' });
    expect(session.workMsByExercise.squat).toBe(600_000);
  });

  it('lets the user end a rest early, and rest never counts as work', () => {
    const session = run(
      started(),
      { type: 'tick', ms: 30_000, now: T0 },
      { type: 'tick', ms: 10_000, now: T0 },
      { type: 'complete', now: T0 }, // squat set 1
      { type: 'tick', ms: 5_000, now: T0 },
      { type: 'complete', now: T0 }, // end rest after 5 s: a rest can be ended at any moment
    );
    expect(currentStep(session)).toMatchObject({ exerciseId: 'squat', set: 2 });
    expect(session.workMsByExercise).toEqual({ 'neck-rolls': 30_000, squat: 10_000 });
    expect(session.totalMs).toBe(45_000);
  });

  it('crosses several timed steps in one long tick (the app was in the background)', () => {
    const atRest = run(started(), { type: 'tick', ms: 30_000, now: T0 }, { type: 'tick', ms: 1_000, now: T0 }, { type: 'complete', now: T0 });
    // 20 s rest, then it must stop at the reps set and not run through it.
    const session = reduce(atRest, { type: 'tick', ms: 500_000, now: T0 });
    expect(currentStep(session)).toMatchObject({ kind: 'work', exerciseId: 'squat', set: 2 });
    expect(session.stepMs).toBe(480_000);
  });

  it('does not count time or accept presses while paused', () => {
    const paused = run(started(), { type: 'tick', ms: 10_000, now: T0 }, { type: 'pause' });
    const still = run(paused, { type: 'tick', ms: 60_000, now: T0 }, { type: 'complete', now: T0 }, { type: 'skip', now: T0 });
    expect(still).toEqual(paused);
    expect(secondsLeft(reduce(paused, { type: 'resume' }))).toBe(20);
  });

  it('does not count a skipped set as done, but keeps the time spent on it', () => {
    const session = run(started(), { type: 'tick', ms: 8_000, now: T0 }, { type: 'skip', now: T0 });
    expect(session.setsDone).toEqual({});
    expect(session.workMsByExercise).toEqual({ 'neck-rolls': 8_000 });
    expect(session.index).toBe(1);
  });

  it('is done after the last step and summarises what was done', () => {
    const session = run(
      started(),
      { type: 'tick', ms: 30_000, now: T0 + 30_000 },
      { type: 'tick', ms: 40_000, now: T0 + 70_000 },
      { type: 'complete', now: T0 + 70_000 },
      { type: 'tick', ms: 20_000, now: T0 + 90_000 },
      { type: 'tick', ms: 35_000, now: T0 + 125_000 },
      { type: 'complete', now: T0 + 125_000 },
      { type: 'tick', ms: 20_000, now: T0 + 145_000 },
      { type: 'tick', ms: 15_000, now: T0 + 160_000 },
    );
    expect(session.status).toBe('done');
    expect(summarize(session)).toEqual({
      exercises_completed: [
        { exercise_id: 'neck-rolls', sets_done: 1 },
        { exercise_id: 'squat', sets_done: 2 },
        { exercise_id: 'plank', sets_done: 1 },
      ],
      duration_minutes: 3,
      activeMs: 160_000,
      startedAt: T0,
      finishedAt: T0 + 160_000,
      workMsByExercise: { 'neck-rolls': 30_000, squat: 75_000, plank: 15_000 },
    });
    // Nothing moves a finished session.
    expect(run(session, { type: 'tick', ms: 5000, now: T0 }, { type: 'complete', now: T0 }, { type: 'finish', now: T0 })).toEqual(session);
  });

  it('can be finished early: what was done is kept, the unfinished set is not counted', () => {
    const session = run(
      started(),
      { type: 'tick', ms: 30_000, now: T0 },
      { type: 'tick', ms: 12_000, now: T0 },
      { type: 'finish', now: T0 + 50_000 },
    );
    expect(session.status).toBe('done');
    expect(summarize(session)).toMatchObject({
      exercises_completed: [{ exercise_id: 'neck-rolls', sets_done: 1 }],
      duration_minutes: 1,
      workMsByExercise: { 'neck-rolls': 30_000, squat: 12_000 },
      finishedAt: T0 + 50_000,
    });
  });

  it('has nothing to log when the session ended before any set was done', () => {
    expect(summarize(run(started(), { type: 'tick', ms: 3_000, now: T0 }, { type: 'finish', now: T0 }))).toBeNull();
    expect(summarize(started())).toBeNull();
  });

  it('ignores a second Done that arrives right after the first (a double tap)', () => {
    const noRest = buildSteps({ ...day, blocks: [{ type: 'main', items: [{ exercise_id: 'squat', sets: 3, amount: 10 }] }] }, unitOf);
    const session = run(
      createSession(noRest),
      { type: 'start', now: T0 },
      { type: 'tick', ms: 20_000, now: T0 },
      { type: 'complete', now: T0 },
      { type: 'complete', now: T0 }, // the same tap, delivered twice
    );
    expect(session.setsDone).toEqual({ squat: 1 });
    expect(session.index).toBe(1);
    // A real second set, a moment later, counts.
    expect(run(session, { type: 'tick', ms: 600, now: T0 }, { type: 'complete', now: T0 }).setsDone).toEqual({ squat: 2 });
  });

  it('logs at least one minute, which is the least the workout_logs table accepts', () => {
    const quick = buildSteps({ ...day, blocks: [{ type: 'main', items: [{ exercise_id: 'plank', sets: 1, amount: 5 }] }] }, unitOf);
    const session = run(createSession(quick), { type: 'start', now: T0 }, { type: 'tick', ms: 5_000, now: T0 + 5_000 });
    expect(summarize(session)).toMatchObject({ duration_minutes: 1, activeMs: 5_000 });
  });

  it('can be finished from pause', () => {
    const session = run(started(), { type: 'tick', ms: 30_000, now: T0 }, { type: 'pause' }, { type: 'finish', now: T0 + 1 });
    expect(session.status).toBe('done');
  });
});
