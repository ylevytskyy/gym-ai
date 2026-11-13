import { exerciseById } from '@/catalog/catalog';
import type { SessionSummary } from '@/player/session';

import { finishWorkout, type FinishInput } from './finish-workout';
import { PlanError, type PlanClient } from './repository';

const summary: SessionSummary = {
  exercises_completed: [{ exercise_id: 'squat', sets_done: 2 }],
  duration_minutes: 6,
  activeMs: 330_000,
  startedAt: Date.parse('2026-11-12T07:30:00Z'),
  finishedAt: Date.parse('2026-11-12T07:36:00Z'),
  workMsByExercise: { squat: 300_000 },
};
const input: FinishInput = { logId: 'log-1', userId: 'user-1', planId: 'plan-1', dayNumber: 2, title: 'Legs', kind: 'strength', weightKg: 72, rating: 4, summary };

function setup(options: { insertError?: object; updateError?: object; recordId?: string | null; writeThrows?: boolean; existing?: { health_record_id: string | null } } = {}) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const client = {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      builder['insert'] = async (...args: unknown[]) => (calls.push({ table, method: 'insert', args }), { error: options.insertError ?? null });
      builder['update'] = (...args: unknown[]) => (calls.push({ table, method: 'update', args }), builder);
      builder['eq'] = (...args: unknown[]) => (calls.push({ table, method: 'eq', args }), builder);
      builder['select'] = () => builder;
      builder['maybeSingle'] = async () => ({ data: options.existing ?? null, error: null });
      builder['then'] = (resolve: (v: unknown) => unknown) => Promise.resolve({ error: options.updateError ?? null }).then(resolve);
      return builder;
    },
  } as unknown as PlanClient;
  const health = {
    writeWorkout: jest.fn(async () => {
      if (options.writeThrows) throw new Error('native');
      return options.recordId === undefined ? 'HK-1' : options.recordId;
    }),
    deleteWorkout: jest.fn(async () => undefined),
  };
  return { deps: { client, health, exercise: exerciseById }, calls, health };
}

describe('finishWorkout', () => {
  it('saves the log, writes the workout to Health with its energy, and links the two', async () => {
    const { deps, calls, health } = setup();

    expect(await finishWorkout(deps, input)).toEqual({ health: 'written' });

    expect(calls[0]).toEqual({
      table: 'workout_logs',
      method: 'insert',
      args: [
        {
          id: 'log-1',
          user_id: 'user-1',
          plan_id: 'plan-1',
          day_number: 2,
          exercises_completed: [{ exercise_id: 'squat', sets_done: 2 }],
          duration_minutes: 6,
          rating: 4,
          completed_at: '2026-11-12T07:36:00.000Z',
        },
      ],
    });
    const squat = exerciseById('squat')!;
    expect(health.writeWorkout).toHaveBeenCalledWith({
      start: new Date(summary.startedAt),
      // The time actually spent, not the time on the wall clock: pauses are not exercise.
      end: new Date(summary.startedAt + 330_000),
      kind: 'strength',
      title: 'Legs',
      energyKcal: Math.round((squat.met - 1) * 72 * (300_000 / 3_600_000) * 10) / 10,
    });
    expect(calls).toContainEqual({ table: 'workout_logs', method: 'update', args: [{ health_record_id: 'HK-1' }] });
    expect(calls).toContainEqual({ table: 'workout_logs', method: 'eq', args: ['id', 'log-1'] });
    expect(calls).toContainEqual({ table: 'workout_logs', method: 'eq', args: ['user_id', 'user-1'] });
    // The log is saved before anything goes to Health.
    expect(calls[0]!.method).toBe('insert');
  });

  it('writes nothing to Health when the log cannot be saved', async () => {
    const { deps, health } = setup({ insertError: { code: '500', message: 'boom' } });
    await expect(finishWorkout(deps, input)).rejects.toBeInstanceOf(PlanError);
    expect(health.writeWorkout).not.toHaveBeenCalled();
  });

  it('finishes the job when the log is already there but not yet in Health (a retry after a lost reply)', async () => {
    const { deps, health } = setup({ insertError: { code: '23505', message: 'duplicate key' }, existing: { health_record_id: null } });
    await expect(finishWorkout(deps, input)).resolves.toEqual({ health: 'written' });
    expect(health.writeWorkout).toHaveBeenCalledTimes(1);
  });

  it('never writes a second workout to Health for a log that already has one', async () => {
    const { deps, health, calls } = setup({ insertError: { code: '23505', message: 'duplicate key' }, existing: { health_record_id: 'HK-OLD' } });
    await expect(finishWorkout(deps, input)).resolves.toEqual({ health: 'written' });
    expect(health.writeWorkout).not.toHaveBeenCalled();
    expect(calls.some((call) => call.method === 'update')).toBe(false);
  });

  it('keeps the log when Health is off, denies the write or fails', async () => {
    for (const options of [{ recordId: null }, { writeThrows: true }]) {
      const { deps, calls } = setup(options);
      expect(await finishWorkout(deps, input)).toEqual({ health: 'not_written' });
      expect(calls.some((call) => call.method === 'update')).toBe(false);
    }
  });

  it('takes the workout back out of Health when the link cannot be stored', async () => {
    const { deps, health } = setup({ updateError: { message: 'offline' } });
    expect(await finishWorkout(deps, input)).toEqual({ health: 'not_written' });
    expect(health.deleteWorkout).toHaveBeenCalledWith('HK-1');
  });

  it('writes no energy when none can be estimated', async () => {
    const { deps, health } = setup();
    await finishWorkout(deps, { ...input, weightKg: 0 });
    expect((health.writeWorkout.mock.calls as unknown as object[][])[0]![0]).not.toHaveProperty('energyKcal');
  });
});
