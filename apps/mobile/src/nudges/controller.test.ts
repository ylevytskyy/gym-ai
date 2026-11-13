import { DEFAULT_NUDGE_SETTINGS } from '@aura-fit/health-core';

import { createHealthController, type Preferences } from '@/health/controller';
import { createFakeHealthStore, type FakeHealthOptions } from '@/health/fake-store';

import { createNudgeController, sanitizeSettings } from './controller';
import { createFakeNotifier } from './notifier';

const MIN = 60_000;
// Thursday 2026-11-12, 11:00 in Kyiv.
const thursday11 = new Date('2026-11-12T09:00:00Z');
const at = (minutes: number) => new Date(thursday11.getTime() + minutes * MIN);

function setup(
  options: {
    health?: FakeHealthOptions;
    stored?: Record<string, string>;
    notifier?: Parameters<typeof createFakeNotifier>[0];
  } = {},
) {
  const data = new Map(Object.entries({ 'health.enabled': 'true', ...options.stored }));
  const preferences: Preferences = { get: async (key) => data.get(key) ?? null, set: async (key, value) => void data.set(key, value) };
  const store = createFakeHealthStore({ initial: 'connected', recentSteps: [], ...options.health });
  const health = createHealthController(store, preferences);
  const clock = { now: thursday11 };
  const notifier = createFakeNotifier({ ...options.notifier, now: () => clock.now });
  const nudges = createNudgeController({ health, notifier, preferences, now: () => clock.now, timeZone: () => 'Europe/Kyiv' });
  return { nudges, notifier, store, health, data, clock };
}

const ON = { 'nudges.settings': JSON.stringify({ ...DEFAULT_NUDGE_SETTINGS, enabled: true }) };

describe('nudge controller: turning on and off', () => {
  it('is off until the user turns it on, and asks for nothing before that', async () => {
    const { nudges, notifier } = setup();
    const status = await nudges.refresh();
    expect(status.settings.enabled).toBe(false);
    expect(status.next).toBeNull();
    expect(notifier.requests).toBe(0);
    expect(notifier.scheduled).toEqual([]);
  });

  it('asks for notifications when turned on, then plans and turns background reading on', async () => {
    const { nudges, notifier, store } = setup();
    const status = await nudges.turnOn();
    expect(notifier.requests).toBe(1);
    expect(status.settings.enabled).toBe(true);
    expect(status.permission).toBe('granted');
    expect(status.background).toBe(true);
    expect(store.background).toBe(true);
    expect(notifier.scheduled).toEqual([at(0), at(90), at(180)]);
    expect(status.next).toEqual(at(0));
  });

  it('stays off when notifications are refused', async () => {
    const { nudges, notifier, store } = setup({ notifier: { answer: 'denied' } });
    const status = await nudges.turnOn();
    expect(status.settings.enabled).toBe(false);
    expect(status.permission).toBe('denied');
    expect(notifier.scheduled).toEqual([]);
    expect(store.background).toBe(false);
  });

  it('stays on without background reading when that is refused, and says so', async () => {
    const { nudges, notifier } = setup({ health: { backgroundGranted: false } });
    const status = await nudges.turnOn();
    expect(status.settings.enabled).toBe(true);
    expect(status.background).toBe(false);
    expect(notifier.scheduled.length).toBe(3);
  });

  it('cancels everything and stops background reading when turned off', async () => {
    const { nudges, notifier, store } = setup();
    await nudges.turnOn();
    const status = await nudges.turnOff();
    expect(status.settings.enabled).toBe(false);
    expect(status.next).toBeNull();
    expect(notifier.scheduled).toEqual([]);
    expect(store.background).toBe(false);
  });

  it('remembers the choice across launches', async () => {
    const first = setup();
    await first.nudges.turnOn();
    const second = setup({ stored: Object.fromEntries(first.data), notifier: { initial: 'granted' } });
    expect((await second.nudges.refresh()).settings.enabled).toBe(true);
  });
});

describe('nudge controller: planning', () => {
  it('plans from the steps of the last hour', async () => {
    const { nudges, notifier } = setup({ stored: ON, notifier: { initial: 'granted' }, health: { recentSteps: [{ end: at(-40), steps: 400 }] } });
    const status = await nudges.refresh();
    expect(status.next).toEqual(at(20));
    expect(notifier.scheduled[0]).toEqual(at(20));
  });

  it('moves the plan when new steps are seen', async () => {
    const { nudges, notifier, store, clock } = setup({ stored: ON, notifier: { initial: 'granted' }, health: { recentSteps: [{ end: at(-40), steps: 400 }] } });
    await nudges.refresh();
    clock.now = at(10);
    store.setRecentSteps([{ end: at(-40), steps: 400 }, { end: at(8), steps: 300 }]);
    const status = await nudges.refresh();
    expect(status.next).toEqual(at(68));
    expect(notifier.scheduled[0]).toEqual(at(68));
    expect(notifier.scheduled).toHaveLength(3);
  });

  it('counts a planned nudge whose time has passed as sent', async () => {
    const { nudges, notifier, clock } = setup({ stored: ON, notifier: { initial: 'granted' } });
    await nudges.refresh(); // 11:00, 12:30, 14:00
    clock.now = at(30);
    const status = await nudges.refresh();
    // 11:00 was shown; the next keeps the gap to it and one more fits the daily limit.
    expect(notifier.scheduled).toEqual([at(90), at(180)]);
    expect(status.next).toEqual(at(90));
  });

  it('never plans more than the daily limit across refreshes', async () => {
    const { nudges, notifier, clock } = setup({ stored: ON, notifier: { initial: 'granted' } });
    await nudges.refresh();
    for (const minutes of [91, 181, 271, 361]) {
      clock.now = at(minutes);
      await nudges.refresh();
    }
    expect(notifier.scheduled).toEqual([]);
  });

  it('leaves a nudge that is due but not shown yet alone when the plan changes (phones show them late)', async () => {
    const { nudges, notifier, store, clock } = setup({
      stored: ON,
      notifier: { initial: 'granted', lateMs: 10 * MIN },
      health: { recentSteps: [{ end: at(-40), steps: 400 }] },
    });
    await nudges.refresh(); // 11:20, 12:50, 14:20
    clock.now = at(23);
    store.setRecentSteps([{ end: at(15), steps: 300 }]);
    await nudges.refresh();
    // 11:20 is still on its way and counts as sent; the next keeps the gap to it.
    expect(notifier.scheduled).toEqual([at(20), at(110), at(200)]);
  });

  it('drops what was planned under the old hours even when steps cannot be read', async () => {
    const { nudges, notifier, store } = setup({ stored: ON, notifier: { initial: 'granted' } });
    await nudges.refresh();
    store.setRecentSteps(null);
    const status = await nudges.save({ startHour: 11, endHour: 16 });
    expect(status.next).toBeNull();
    expect(notifier.scheduled).toEqual([]);
  });

  it('keeps what is scheduled when steps cannot be read right now (a locked phone)', async () => {
    const { nudges, notifier, store, clock } = setup({ stored: ON, notifier: { initial: 'granted' }, health: { recentSteps: [{ end: at(-40), steps: 400 }] } });
    await nudges.refresh();
    const cancels = notifier.cancels;
    clock.now = at(5);
    store.setRecentSteps(null);
    const status = await nudges.refresh();
    expect(notifier.cancels).toBe(cancels);
    expect(notifier.scheduled[0]).toEqual(at(20));
    expect(status.next).toEqual(at(20));
  });

  it('plans nothing when steps were never readable', async () => {
    const { nudges, notifier } = setup({ stored: ON, notifier: { initial: 'granted' }, health: { recentSteps: null } });
    expect((await nudges.refresh()).next).toBeNull();
    expect(notifier.scheduled).toEqual([]);
  });

  it('cancels everything when Health is disconnected or notifications were taken away', async () => {
    const disconnected = setup({ stored: ON, notifier: { initial: 'granted' } });
    await disconnected.nudges.refresh();
    await disconnected.health.disconnect();
    expect((await disconnected.nudges.refresh()).next).toBeNull();
    expect(disconnected.notifier.scheduled).toEqual([]);

    const denied = setup({ stored: ON, notifier: { initial: 'denied' } });
    const status = await denied.nudges.refresh();
    expect(status.permission).toBe('denied');
    expect(status.settings.enabled).toBe(true);
    expect(denied.notifier.scheduled).toEqual([]);
  });

  it('does not schedule again when the plan did not change', async () => {
    const { nudges, notifier, clock } = setup({ stored: ON, notifier: { initial: 'granted' }, health: { recentSteps: [{ end: at(-40), steps: 400 }] } });
    await nudges.refresh();
    const cancels = notifier.cancels;
    clock.now = at(5);
    await nudges.refresh();
    expect(notifier.cancels).toBe(cancels);
    expect(notifier.scheduled[0]).toEqual(at(20));
  });

  it('runs overlapping refreshes one after another, leaving one plan', async () => {
    const { nudges, notifier } = setup({ stored: ON, notifier: { initial: 'granted' } });
    await Promise.all([nudges.refresh(), nudges.refresh(), nudges.refresh()]);
    expect(notifier.scheduled).toEqual([at(0), at(90), at(180)]);
  });

  it('never throws, whatever fails underneath', async () => {
    const { nudges } = setup({ stored: ON, notifier: { initial: 'granted', scheduleFails: true } });
    const status = await nudges.refresh();
    expect(status.next).toBeNull();
    const broken = setup({ stored: { 'nudges.settings': '{not json', 'nudges.planned': 'x', 'nudges.notBefore': 'y' }, notifier: { initial: 'granted' } });
    expect((await broken.nudges.refresh()).settings).toEqual(DEFAULT_NUDGE_SETTINGS);
  });
});

describe('nudge controller: settings and workouts', () => {
  it('saves active hours and weekdays, and plans again', async () => {
    const { nudges, notifier } = setup({ stored: ON, notifier: { initial: 'granted' } });
    const status = await nudges.save({ startHour: 13, endHour: 15, weekdaysOnly: false });
    expect(status.settings).toMatchObject({ startHour: 13, endHour: 15, weekdaysOnly: false, enabled: true });
    // 13:00 and 14:30 in Kyiv.
    expect(notifier.scheduled).toEqual([at(120), at(210)]);
  });

  it('cannot be switched on through save: that needs the permission request', async () => {
    const { nudges } = setup();
    expect((await nudges.save({ enabled: true } as never)).settings.enabled).toBe(false);
  });

  it('holds nudges during a workout and waits an hour after it', async () => {
    const { nudges, notifier, clock } = setup({ stored: ON, notifier: { initial: 'granted' } });
    await nudges.refresh();
    await nudges.hold();
    expect(notifier.scheduled).toEqual([]);
    clock.now = at(20);
    const status = await nudges.moved();
    // 11:00 was cancelled before it could show, so it does not count as sent.
    expect(status.next).toEqual(at(80));
    expect(notifier.scheduled).toEqual([at(80), at(170), at(260)]);
  });

  it('plans nothing while a workout is open, whatever refreshes in between', async () => {
    const { nudges, notifier, clock } = setup({ stored: ON, notifier: { initial: 'granted' } });
    await nudges.refresh();
    await nudges.hold();
    clock.now = at(10);
    expect((await nudges.refresh()).next).toBeNull();
    expect(notifier.scheduled).toEqual([]);
  });

  it('ends a hold by itself after two hours, in case the app was closed mid-workout', async () => {
    const { nudges, clock } = setup({ stored: ON, notifier: { initial: 'granted' } });
    await nudges.hold();
    clock.now = at(121);
    expect((await nudges.refresh()).next).toEqual(at(121));
  });

  it('plans as before when a session was opened and closed without starting', async () => {
    const { nudges, notifier, clock } = setup({ stored: ON, notifier: { initial: 'granted' }, health: { recentSteps: [{ end: at(-40), steps: 400 }] } });
    await nudges.refresh();
    await nudges.hold();
    clock.now = at(1);
    expect((await nudges.release()).next).toEqual(at(20));
    expect(notifier.scheduled[0]).toEqual(at(20));
  });

  it('keeps waiting after a workout across later refreshes', async () => {
    const { nudges, clock } = setup({ stored: ON, notifier: { initial: 'granted' } });
    await nudges.moved();
    clock.now = at(10);
    expect((await nudges.refresh()).next).toEqual(at(60));
  });
});

describe('sanitizeSettings', () => {
  it('keeps valid values and replaces anything else with the defaults', () => {
    expect(sanitizeSettings({ enabled: true, startHour: 8, endHour: 20, weekdaysOnly: false })).toEqual({
      ...DEFAULT_NUDGE_SETTINGS,
      enabled: true,
      startHour: 8,
      endHour: 20,
      weekdaysOnly: false,
    });
    expect(sanitizeSettings({ startHour: 20, endHour: 8 })).toEqual(DEFAULT_NUDGE_SETTINGS);
    expect(sanitizeSettings({ startHour: -1, endHour: 99, stepThreshold: 0, maxPerDay: 500, minGapMinutes: 1 })).toEqual(DEFAULT_NUDGE_SETTINGS);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_NUDGE_SETTINGS);
    expect(sanitizeSettings('x')).toEqual(DEFAULT_NUDGE_SETTINGS);
  });
});
