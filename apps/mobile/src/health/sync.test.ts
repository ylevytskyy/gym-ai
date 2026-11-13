import type { HealthDay } from '@aura-fit/health-core';

import { createHealthSync, toRow } from './sync';

const day = (d: string, fields: Partial<HealthDay> = {}): HealthDay => ({ day: d, tz: 'Europe/Kyiv', platform: 'ios', ...fields });

function fakeClient(error: object | null = null) {
  const calls: { table: string; rows: unknown; options: unknown }[] = [];
  const client = {
    from: (table: string) => ({
      upsert: async (rows: unknown, options: unknown) => (calls.push({ table, rows, options }), { error }),
    }),
  };
  return { client: client as never, calls };
}

describe('toRow', () => {
  it('writes every measurement, with null for the ones the day does not have', () => {
    expect(toRow('user-1', day('2026-11-12', { steps: 0, sleep_minutes: 430 }))).toEqual({
      user_id: 'user-1',
      day: '2026-11-12',
      tz: 'Europe/Kyiv',
      platform: 'ios',
      steps: 0,
      active_energy_kcal: null,
      resting_hr_bpm: null,
      sleep_minutes: 430,
      weight_kg: null,
      external_workouts: [],
    });
  });

  it('keeps external workouts as they are', () => {
    const workouts = [{ type: 'running' as const, minutes: 42, energy_kcal: 430.5 }];
    expect(toRow('u', day('2026-11-12', { external_workouts: workouts })).external_workouts).toEqual(workouts);
  });
});

describe('health sync', () => {
  const days = [day('2026-11-11', { steps: 8000 }), day('2026-11-12', { steps: 1200, weight_kg: 78 })];

  it('upserts one row per day under the user id, replacing the row of the same day', async () => {
    const { client, calls } = fakeClient();
    const sync = createHealthSync(client);

    expect(await sync('user-1', days)).toBe('synced');

    expect(calls).toHaveLength(1);
    expect(calls[0]!.table).toBe('health_days');
    expect(calls[0]!.options).toEqual({ onConflict: 'user_id,day' });
    expect(calls[0]!.rows).toEqual(days.map((d) => toRow('user-1', d)));
  });

  it('does not send the same days again', async () => {
    const { client, calls } = fakeClient();
    const sync = createHealthSync(client);
    await sync('user-1', days);

    expect(await sync('user-1', days)).toBe('unchanged');
    expect(calls).toHaveLength(1);
  });

  it('sends again when a day changed, and for another user', async () => {
    const { client, calls } = fakeClient();
    const sync = createHealthSync(client);
    await sync('user-1', days);

    await sync('user-1', [days[0]!, day('2026-11-12', { steps: 1900, weight_kg: 78 })]);
    await sync('user-2', days);

    expect(calls).toHaveLength(3);
    expect((calls[2]!.rows as { user_id: string }[]).every((row) => row.user_id === 'user-2')).toBe(true);
  });

  it('reports a failure without throwing, and tries again next time', async () => {
    const failing = fakeClient({ message: 'offline' });
    const sync = createHealthSync(failing.client);

    expect(await sync('user-1', days)).toBe('failed');
    expect(await sync('user-1', days)).toBe('failed');
    expect(failing.calls).toHaveLength(2);
  });

  it('sends the same days again after being told to forget (disconnect, or the data was deleted)', async () => {
    const { client, calls } = fakeClient();
    const sync = createHealthSync(client);
    await sync('user-1', days);
    sync.forget('user-1');
    expect(await sync('user-1', days)).toBe('synced');
    expect(calls).toHaveLength(2);
  });

  it('has nothing to do without days', async () => {
    const { client, calls } = fakeClient();
    expect(await createHealthSync(client)('user-1', [])).toBe('unchanged');
    expect(calls).toHaveLength(0);
  });

  it('survives a client that throws', async () => {
    const client = { from: () => ({ upsert: async () => { throw new TypeError('Network request failed'); } }) } as never;
    expect(await createHealthSync(client)('user-1', days)).toBe('failed');
  });
});
