import { createHarness } from '@/testing/harness';

import { backgroundRefresh, createStepHandler } from './refresh';

const connected = { 'health.enabled': 'true', 'health.asked': 'true' };
const nudgesOn = { ...connected, 'nudges.settings': JSON.stringify({ enabled: true, startHour: 9, endHour: 18, weekdaysOnly: true }) };
const raw = { steps: [{ day: '2026-11-12', value: 4200 }], activeEnergyKcal: [], restingHrBpm: [], weightKg: [], sleep: [], workouts: [] };

beforeEach(() => {
  // Thursday 10:00 in Kyiv.
  jest.useFakeTimers({ now: new Date('2026-11-12T10:00:00'), doNotFake: ['nextTick', 'setImmediate'] });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('backgroundRefresh', () => {
  it('plans nudges again and syncs today and the 14 days before it', async () => {
    const harness = createHarness({ health: { initial: 'connected', raw, recentSteps: [] }, preferences: nudgesOn, notifier: { initial: 'granted' } });
    const result = await backgroundRefresh(harness.services);

    expect(result).toEqual({ nudges: true, sync: 'synced' });
    expect(harness.notifier.scheduled[0]).toEqual(new Date('2026-11-12T10:00:00'));
    expect(harness.synced).toHaveLength(1);
    expect(harness.synced[0]).toHaveLength(15);
    expect(harness.synced[0]?.at(-1)).toMatchObject({ user_id: 'user-1', day: '2026-11-12', steps: 4200 });
  });

  it('plans nudges but syncs nothing when nobody is signed in', async () => {
    const harness = createHarness({ signedIn: false, health: { initial: 'connected', raw, recentSteps: [] }, preferences: nudgesOn, notifier: { initial: 'granted' } });
    expect(await backgroundRefresh(harness.services)).toEqual({ nudges: true, sync: 'skipped' });
    expect(harness.notifier.scheduled).toHaveLength(3);
    expect(harness.synced).toEqual([]);
  });

  it('syncs nothing when Health is not connected', async () => {
    const harness = createHarness({ health: { initial: 'connected', raw } });
    expect((await backgroundRefresh(harness.services)).sync).toBe('skipped');
    expect(harness.synced).toEqual([]);
  });

  it('never syncs a read in which something failed (a locked phone reads as no data)', async () => {
    const harness = createHarness({ health: { initial: 'connected', raw, readFails: true }, preferences: connected });
    expect((await backgroundRefresh(harness.services)).sync).toBe('skipped');
    expect(harness.synced).toEqual([]);
  });

  it('resolves whatever fails underneath', async () => {
    const harness = createHarness({ health: { initial: 'connected', raw }, preferences: connected });
    const broken = {
      ...harness.services,
      nudges: { ...harness.services.nudges, refresh: async () => Promise.reject(new Error('boom')) },
      supabase: { ...harness.services.supabase, auth: { getSession: async () => Promise.reject(new Error('keychain locked')) } } as never,
    };
    expect(await backgroundRefresh(broken)).toEqual({ nudges: false, sync: 'skipped' });

    const throwingHealth = { ...harness.services, health: { ...harness.services.health, state: async () => Promise.reject(new Error('boom')) } };
    expect((await backgroundRefresh(throwingHealth)).sync).toBe('skipped');
  });
});

describe('createStepHandler', () => {
  const options = { health: { initial: 'connected' as const, raw, recentSteps: [] }, preferences: nudgesOn, notifier: { initial: 'granted' as const } };

  it('does nothing while the app is open: the screens plan and sync themselves', async () => {
    const harness = createHarness(options);
    await createStepHandler(harness.services, () => true)();
    expect(harness.synced).toEqual([]);
    expect(harness.notifier.scheduled).toEqual([]);
  });

  it('refreshes when the app is closed, and folds deliveries that arrive meanwhile into one', async () => {
    const harness = createHarness(options);
    const handler = createStepHandler(harness.services, () => false);
    await Promise.all([handler(), handler(), handler()]);
    expect(harness.synced).toHaveLength(1);
    expect(harness.notifier.scheduled).toHaveLength(3);
    await handler();
    expect(harness.synced).toHaveLength(2);
  });
});
