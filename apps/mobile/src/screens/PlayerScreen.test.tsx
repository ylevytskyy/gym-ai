import { act, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Alert, AppState } from 'react-native';

import { usePlan } from '@/plan/PlanProvider';
import { createHarness, type HarnessOptions } from '@/testing/harness';

import { BreakScreen, PlayerScreen } from './PlayerScreen';
import { TodayScreen } from './TodayScreen';

const mockRouter = { push: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('expo-video', () => {
  const { View } = jest.requireActual('react-native');
  return {
    useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn(), playing: false }),
    VideoView: (props: object) => <View {...props} />,
  };
});

const plan = {
  schema_version: '1.0.0',
  id: 'plan-json-id',
  created_at: '2026-11-10T09:00:00Z',
  goal: 'move_more',
  notes: '',
  days: [
    {
      day: 1,
      title: 'Quick legs',
      minutes: 5,
      blocks: [
        { type: 'warm_up', items: [{ exercise_id: 'plank', sets: 1, amount: 20 }] },
        { type: 'main', items: [{ exercise_id: 'squat', sets: 2, amount: 10, rest_seconds: 15 }] },
      ],
    },
    { day: 2, title: 'Core', minutes: 5, blocks: [{ type: 'main', items: [{ exercise_id: 'side-plank', sets: 1, amount: 20 }] }] },
  ],
};
const profile = { id: 'user-1', age_range: '25-34' as const, weight_kg: 72, goal: 'move_more' as const, fitness_level: 1 as const, injuries: [], minutes_per_day: 15, language: 'en' };

const START = new Date('2026-11-12T07:30:00');
const base: HarnessOptions = {
  profile,
  rows: { plans: { id: 'plan-1', plan_json: plan }, workout_logs: [] },
  health: { initial: 'connected' },
  preferences: { 'health.enabled': 'true', 'health.asked': 'true' },
};

beforeEach(() => {
  jest.useFakeTimers({ now: START, doNotFake: ['nextTick', 'setImmediate'] });
  mockRouter.push.mockClear();
  mockRouter.back.mockClear();
});
afterEach(() => {
  jest.useRealTimers();
});

const user = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
const pass = async (ms: number) => act(async () => void jest.advanceTimersByTime(ms));

/** Today until the plan has loaded, then the player: the order the app goes through. */
function Flow() {
  return usePlan().state.status === 'ready' ? <PlayerScreen platform="ios" /> : <TodayScreen />;
}

async function openPlayer(options: HarnessOptions = base) {
  const harness = createHarness(options);
  await harness.renderScreen(<Flow />);
  await screen.findByTestId('begin');
  return harness;
}

describe('TodayScreen', () => {
  it('shows the day to do with its exercises and opens the player', async () => {
    const harness = createHarness(base);
    await harness.renderScreen(<TodayScreen />);

    expect(await screen.findByText('Quick legs')).toBeTruthy();
    expect(screen.getByText(/Day 1 · about 5 min/)).toBeTruthy();
    expect(screen.getByText('Warm-up: Plank 1 × 20 s')).toBeTruthy();
    expect(screen.getByText('Main: Squat 2 × 10')).toBeTruthy();

    await user().press(screen.getByTestId('start-workout'));
    expect(mockRouter.push).toHaveBeenCalledWith('/player');
  });

  it('moves on to the next day after a session on an earlier date, and marks today as done after one today', async () => {
    const earlier = createHarness({ ...base, rows: { plans: base.rows!.plans, workout_logs: [{ id: 'l1', plan_id: 'plan-1', day_number: 1, completed_at: '2026-11-11T07:00:00', health_record_id: null }] } });
    const first = await earlier.renderScreen(<TodayScreen />);
    expect(await screen.findByText('Core')).toBeTruthy();
    expect(screen.queryByTestId('done-today')).toBeNull();
    await first.unmount();

    const today = createHarness({ ...base, rows: { plans: base.rows!.plans, workout_logs: [{ id: 'l2', plan_id: 'plan-1', day_number: 1, completed_at: '2026-11-12T06:00:00', health_record_id: null }] } });
    await today.renderScreen(<TodayScreen />);
    expect(await screen.findByTestId('done-today')).toBeTruthy();
    expect(screen.getByText('Quick legs')).toBeTruthy();
  });

  it('offers to create a plan when there is none, and shows the new plan', async () => {
    const fetch = jest.fn(async () => ({ ok: true, status: 201, json: async () => ({ id: 'plan-new', plan }) }));
    const harness = createHarness({ ...base, rows: { plans: null }, fetch });
    await harness.renderScreen(<TodayScreen />);

    await user().press(await screen.findByTestId('create-plan'));

    expect(await screen.findByText('Quick legs')).toBeTruthy();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('http://assistant.test/api/plans/generate');
    expect(init.headers['authorization']).toBe('Bearer token');
    expect(JSON.parse(init.body)).toEqual({ duration_days: 3, focus_areas: [] });
  });

  it('explains when the plan could not be made and lets the user try again', async () => {
    const fetch = jest.fn(async () => ({ ok: false, status: 400, json: async () => ({}) }));
    const harness = createHarness({ ...base, rows: { plans: null }, fetch });
    await harness.renderScreen(<TodayScreen />);

    await user().press(await screen.findByTestId('create-plan'));

    expect(await screen.findByText('A plan could not be made this time. Try again.')).toBeTruthy();
    expect(screen.getByTestId('create-plan')).toBeTruthy();
  });
});

describe('PlayerScreen', () => {
  it('plays the day through, saves the log and writes the workout to Health once', async () => {
    const u = user();
    const harness = await openPlayer();

    await u.press(screen.getByTestId('begin'));
    expect(screen.getByText('Plank')).toBeTruthy();
    expect(screen.getByTestId('countdown').props.children).toEqual([20, ' s']);

    await pass(20_000); // the timed warm-up ends by itself
    expect(await screen.findByText('Squat')).toBeTruthy();
    expect(screen.getByText('Set 1 of 2')).toBeTruthy();

    await pass(30_000);
    await u.press(screen.getByTestId('set-done'));
    expect(screen.getByTestId('rest')).toBeTruthy();
    await pass(15_500); // rest ends by itself (the press landed between two ticks)
    expect(screen.getByText('Set 2 of 2')).toBeTruthy();
    await pass(30_000);
    await u.press(screen.getByTestId('set-done'));

    expect(await screen.findByTestId('player-done')).toBeTruthy();
    expect(screen.getByText('2 min · 3 sets')).toBeTruthy();

    await u.press(screen.getByRole('button', { name: 'How was it? (1 easy, 5 hard): 4' }));
    await u.press(screen.getByTestId('save-workout'));

    expect(await screen.findByText('Added to Apple Health.')).toBeTruthy();
    expect(harness.inserts).toHaveLength(1);
    expect(harness.inserts[0]).toMatchObject({
      table: 'workout_logs',
      row: {
        id: 'id-1',
        user_id: 'user-1',
        plan_id: 'plan-1',
        day_number: 1,
        exercises_completed: [{ exercise_id: 'plank', sets_done: 1 }, { exercise_id: 'squat', sets_done: 2 }],
        duration_minutes: 2,
        rating: 4,
      },
    });
    expect(harness.store.written).toHaveLength(1);
    const written = harness.store.written[0]!;
    expect(written).toMatchObject({ kind: 'strength', title: 'Quick legs' });
    // From Begin to the last set: 20 s + 30 s + 15 s + 30 s of session time (presses add a little).
    expect(written.start.getTime() - START.getTime()).toBeLessThan(1000);
    const seconds = (written.end.getTime() - written.start.getTime()) / 1000;
    expect(seconds).toBeGreaterThanOrEqual(95);
    expect(seconds).toBeLessThan(101);
    expect(harness.store.written[0]!.energyKcal).toBeGreaterThan(0);
    expect(harness.updates).toEqual([{ table: 'workout_logs', row: { health_record_id: 'fake-1' } }]);
    // Nothing left to press that could save it again.
    expect(screen.queryByTestId('save-workout')).toBeNull();
  });

  it('does not count time while paused', async () => {
    const u = user();
    await openPlayer();
    await u.press(screen.getByTestId('begin'));
    await pass(5_000);
    await u.press(screen.getByTestId('pause-resume'));
    await pass(60_000);
    expect(screen.getByTestId('countdown').props.children).toEqual([15, ' s']);
    await u.press(screen.getByTestId('pause-resume'));
    await pass(15_000);
    expect(await screen.findByText('Squat')).toBeTruthy();
  });

  it('saves without Health when Health is off, and says so', async () => {
    const u = user();
    const harness = await openPlayer({ ...base, preferences: {} });
    await u.press(screen.getByTestId('begin'));
    await pass(20_000);
    await u.press(screen.getByTestId('end-workout'));
    await u.press(await screen.findByTestId('save-workout'));

    expect(await screen.findByText('Not added to Apple Health.')).toBeTruthy();
    expect(harness.inserts).toHaveLength(1);
    expect(harness.store.written).toHaveLength(0);
  });

  it('keeps the session and lets the user retry when saving fails, without writing to Health', async () => {
    const u = user();
    const harness = await openPlayer({ ...base, saveFails: true });
    await u.press(screen.getByTestId('begin'));
    await pass(20_000);
    await u.press(screen.getByTestId('end-workout'));
    await u.press(await screen.findByTestId('save-workout'));

    expect(await screen.findByText(/Could not save your workout/)).toBeTruthy();
    expect(screen.getByTestId('save-workout')).toBeTruthy();
    expect(harness.store.written).toHaveLength(0);
    // The retry uses the same row id.
    await u.press(screen.getByTestId('save-workout'));
    await waitFor(() => expect(harness.inserts).toHaveLength(2));
    expect(harness.inserts[0]!.row['id']).toBe(harness.inserts[1]!.row['id']);
  });

  it('has nothing to save when the workout is ended before any set is finished', async () => {
    const u = user();
    const harness = await openPlayer();
    await u.press(screen.getByTestId('begin'));
    await pass(3_000);
    await u.press(screen.getByTestId('end-workout'));

    expect(await screen.findByText('No set was finished, so there is nothing to save.')).toBeTruthy();
    expect(screen.queryByTestId('save-workout')).toBeNull();
    await u.press(screen.getByTestId('leave-player'));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(harness.inserts).toHaveLength(0);
  });

  it('does not count a skipped set', async () => {
    const u = user();
    const harness = await openPlayer();
    await u.press(screen.getByTestId('begin'));
    await u.press(screen.getByTestId('skip-set')); // warm-up skipped
    await pass(5_000);
    await u.press(await screen.findByTestId('set-done')); // squat set 1
    await u.press(screen.getByTestId('skip-rest'));
    await pass(2_000);
    await u.press(screen.getByTestId('skip-set')); // squat set 2 skipped
    await u.press(await screen.findByTestId('save-workout'));

    await screen.findByTestId('saved');
    expect(harness.inserts[0]!.row['exercises_completed']).toEqual([{ exercise_id: 'squat', sets_done: 1 }]);
  });
});

describe('PlayerScreen: things found in review', () => {
  it('starts one save for two presses that arrive together: one log, one workout in Health', async () => {
    const u = user();
    const harness = await openPlayer();
    await u.press(screen.getByTestId('begin'));
    await pass(20_000);
    await u.press(screen.getByTestId('end-workout'));
    const save = await screen.findByTestId('save-workout');

    await act(async () => {
      fireEvent.press(save);
      fireEvent.press(save);
    });

    await screen.findByTestId('saved');
    expect(harness.inserts).toHaveLength(1);
    expect(harness.store.written).toHaveLength(1);
    expect(harness.updates).toHaveLength(1);
  });

  it('pauses when the app goes to the background, so that time is neither logged nor sent to Health', async () => {
    const listeners: ((status: string) => void)[] = [];
    const original = AppState.addEventListener;
    AppState.addEventListener = ((_: string, listener: (status: string) => void) => {
      listeners.push(listener);
      return { remove: jest.fn() };
    }) as never;
    const u = user();
    const harness = await openPlayer();
    await u.press(screen.getByTestId('begin'));
    await pass(20_000); // plank done
    await pass(10_000); // 10 s into the squat set

    await act(async () => listeners.forEach((listener) => listener('background')));
    await pass(8 * 3_600_000); // eight hours later
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();

    await u.press(screen.getByTestId('pause-resume'));
    await pass(5_000);
    await u.press(screen.getByTestId('set-done'));
    await u.press(screen.getByTestId('end-workout'));
    await u.press(await screen.findByTestId('save-workout'));
    await screen.findByTestId('saved');

    expect(harness.inserts[0]!.row['duration_minutes']).toBe(1);
    const written = harness.store.written[0]!;
    expect((written.end.getTime() - written.start.getTime()) / 1000).toBeLessThan(60);
    expect(written.energyKcal).toBeLessThan(5);
    AppState.addEventListener = original;
  });

  it('counts at most a second for one late tick (the app was stalled, the user was not training)', async () => {
    const u = user();
    await openPlayer();
    await u.press(screen.getByTestId('begin'));
    await pass(2_000);
    expect(screen.getByTestId('countdown').props.children).toEqual([18, ' s']);

    // The clock jumps a minute without any tick being delivered, then ticking resumes.
    jest.setSystemTime(Date.now() + 60_000);
    await pass(250);

    expect(screen.getByTestId('countdown').props.children).toEqual([17, ' s']);
  });

  it('waits for the plan when the player opens first, instead of saying there is no workout', async () => {
    const harness = createHarness(base);
    await harness.renderScreen(<PlayerScreen platform="ios" />);
    // First render: the plan is still loading.
    expect(screen.queryByText('There is no workout to play.')).toBeNull();
    expect(await screen.findByTestId('begin')).toBeTruthy();
  });

  it('says there is no workout when the user has no plan', async () => {
    const harness = createHarness({ ...base, rows: { plans: null } });
    await harness.renderScreen(<PlayerScreen platform="ios" />);
    expect(await screen.findByText('There is no workout to play.')).toBeTruthy();
  });

  it('asks before throwing away an unsaved session, and leaves without asking once it is saved', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const u = user();
    await openPlayer();
    await u.press(screen.getByTestId('begin'));
    await pass(20_000);
    await u.press(screen.getByTestId('end-workout'));

    await u.press(await screen.findByTestId('leave-player')); // "Discard"
    expect(alert).toHaveBeenCalledTimes(1);
    expect(mockRouter.back).not.toHaveBeenCalled();
    // Choosing "Leave" in the dialog leaves.
    const buttons = alert.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
    buttons.find((button) => button.text === 'Leave')!.onPress!();
    expect(mockRouter.back).toHaveBeenCalledTimes(1);

    await u.press(screen.getByTestId('save-workout'));
    await screen.findByTestId('saved');
    await u.press(screen.getByTestId('leave-player')); // "Back to Today"
    expect(alert).toHaveBeenCalledTimes(1);
    expect(mockRouter.back).toHaveBeenCalledTimes(2);
    alert.mockRestore();
  });
});

describe('health days: sync and adjustment', () => {
  /** Seven ordinary nights before today, then today's night. */
  function nights(lastNightMinutes: number) {
    const sleep = [];
    for (let back = 7; back >= 0; back--) {
      const wake = new Date(2026, 10, 12 - back, 7, 0);
      const minutes = back === 0 ? lastNightMinutes : 480;
      sleep.push({ start: new Date(wake.getTime() - minutes * 60_000), end: wake });
    }
    return { steps: [{ day: '2026-11-12', value: 900 }], activeEnergyKcal: [], restingHrBpm: [], weightKg: [], sleep, workouts: [] };
  }

  it('sends the last 15 health days to the server when Health is connected', async () => {
    const harness = createHarness({ ...base, health: { initial: 'connected', raw: nights(470) } });
    await harness.renderScreen(<TodayScreen />);
    await screen.findByTestId('today-plan');

    await waitFor(() => expect(harness.synced).toHaveLength(1));
    const rows = harness.synced[0]!;
    expect(rows).toHaveLength(15);
    expect(rows.every((row) => row['user_id'] === 'user-1')).toBe(true);
    expect(rows[14]).toMatchObject({ day: '2026-11-12', steps: 900, sleep_minutes: 470, resting_hr_bpm: null, external_workouts: [] });
    expect(rows[0]).toMatchObject({ day: '2026-10-29', steps: null, sleep_minutes: null });
  });

  it('sends nothing when Health is off', async () => {
    const harness = createHarness({ ...base, preferences: {}, health: { initial: 'connected', raw: nights(300) } });
    await harness.renderScreen(<TodayScreen />);
    await screen.findByTestId('today-plan');
    await pass(1000);

    expect(harness.synced).toEqual([]);
    expect(screen.queryByTestId('adjustment')).toBeNull();
  });

  it('shows a lighter session and the reason after a short night, and the player runs that session', async () => {
    const harness = createHarness({ ...base, health: { initial: 'connected', raw: nights(300) } });
    await harness.renderScreen(<Flow />);

    // Flow shows the player once everything is loaded; the squat block lost one of its two sets.
    await screen.findByTestId('begin');
    expect(screen.getByText(/^2 sets, about 5 minutes/)).toBeTruthy();
  });

  it('explains the adjustment on Today', async () => {
    const harness = createHarness({ ...base, health: { initial: 'connected', raw: nights(300) } });
    await harness.renderScreen(<TodayScreen />);

    expect(await screen.findByText('A lighter session today: you slept less than 6 hours and you slept much less than usual.')).toBeTruthy();
    expect(screen.getByText('Main: Squat 1 × 10')).toBeTruthy();
    expect(screen.getByText(/not medical advice/)).toBeTruthy();
  });

  it('does not sync a read in which something failed: the gap would erase what the server holds', async () => {
    const harness = createHarness({ ...base, health: { initial: 'connected', raw: nights(470), readFails: true } });
    await harness.renderScreen(<TodayScreen />);
    await screen.findByTestId('today-plan');
    await pass(1000);
    expect(harness.synced).toEqual([]);
  });

  it('waits for a slow Health read, so the player runs the adjusted session', async () => {
    const harness = createHarness({ ...base, health: { initial: 'connected', raw: nights(300), readDelayMs: 1500 } });
    await harness.renderScreen(<PlayerScreen platform="ios" />);
    await pass(500);
    expect(screen.queryByTestId('begin')).toBeNull();
    expect(screen.getByText('Loading your workout…')).toBeTruthy();
    await pass(1500);
    await screen.findByTestId('begin');
    expect(screen.getByText(/^2 sets, about 5 minutes/)).toBeTruthy();
  });

  it('stops waiting after three seconds and plays the session as planned', async () => {
    const harness = createHarness({ ...base, health: { initial: 'connected', raw: nights(300), readDelayMs: 600_000 } });
    await harness.renderScreen(<PlayerScreen platform="ios" />);
    await pass(2500);
    expect(screen.queryByTestId('begin')).toBeNull();
    await pass(1000);
    await screen.findByTestId('begin');
    expect(screen.getByText(/^3 sets, about 5 minutes/)).toBeTruthy();
  });

  it('says there is no workout when nobody is signed in', async () => {
    const harness = createHarness({ ...base, signedIn: false });
    await harness.renderScreen(<PlayerScreen platform="ios" />);
    await pass(4000);
    expect(screen.getByText('There is no workout to play.')).toBeTruthy();
  });

  it('leaves the session as planned after an ordinary night', async () => {
    const harness = createHarness({ ...base, health: { initial: 'connected', raw: nights(465) } });
    await harness.renderScreen(<TodayScreen />);
    await screen.findByTestId('today-plan');
    await waitFor(() => expect(harness.synced).toHaveLength(1));

    expect(screen.queryByTestId('adjustment')).toBeNull();
    expect(screen.getByText('Main: Squat 2 × 10')).toBeTruthy();
  });
});

describe('sitting nudges and the player', () => {
  const nudgesOn = { ...base.preferences, 'nudges.settings': JSON.stringify({ enabled: true, startHour: 7, endHour: 18, weekdaysOnly: true }) };
  const withNudges: HarnessOptions = { ...base, health: { initial: 'connected', recentSteps: [] }, preferences: nudgesOn, notifier: { initial: 'granted' } };

  it('holds nudges while a workout is open and waits an hour after it', async () => {
    const harness = await openPlayer(withNudges);
    await waitFor(() => expect(harness.notifier.scheduled).toEqual([]));

    await user().press(screen.getByTestId('begin'));
    await pass(60_000);
    // Coming back from another app plans again; nothing may be planned in the middle of a workout.
    await harness.services.nudges.refresh();
    expect(harness.notifier.scheduled).toEqual([]);
    await screen.unmount();

    // The player closed at 07:31: nothing before 08:31.
    await waitFor(() => expect(harness.notifier.scheduled.length).toBeGreaterThan(0));
    const first = harness.notifier.scheduled[0]?.getTime() ?? 0;
    expect(first - new Date('2026-11-12T08:31:00').getTime()).toBeGreaterThanOrEqual(0);
    expect(first - new Date('2026-11-12T08:31:00').getTime()).toBeLessThan(1000);
  });
});

describe('sitting nudges and a session that was not started', () => {
  it('plans as before when the player is opened and left without beginning', async () => {
    const nudgesOn = { ...base.preferences, 'nudges.settings': JSON.stringify({ enabled: true, startHour: 7, endHour: 18, weekdaysOnly: true }) };
    const harness = await openPlayer({ ...base, health: { initial: 'connected', recentSteps: [] }, preferences: nudgesOn, notifier: { initial: 'granted' } });
    await waitFor(() => expect(harness.notifier.scheduled).toEqual([]));
    await pass(60_000);
    await screen.unmount();
    await waitFor(() => expect(harness.notifier.scheduled[0]).toEqual(new Date('2026-11-12T07:31:00')));
  });
});

describe('BreakScreen', () => {
  const breakOptions: HarnessOptions = { ...base, profile: { ...profile, injuries: ['neck_injury'] as never } };

  it('plays a desk break that is safe for the profile and saves nothing', async () => {
    const press = user();
    const harness = createHarness(breakOptions);
    await harness.renderScreen(<BreakScreen platform="ios" />);

    expect(await screen.findByText('Desk break')).toBeTruthy();
    await press.press(screen.getByTestId('begin'));
    expect(screen.queryByText('neck rolls', { exact: false })).toBeNull();

    await press.press(screen.getByTestId('end-workout'));

    expect(await screen.findByTestId('break-done')).toBeTruthy();
    expect(screen.queryByTestId('save-workout')).toBeNull();
    expect(harness.inserts).toEqual([]);
    expect(harness.store.written).toEqual([]);

    await press.press(screen.getByTestId('leave-player'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('works without a plan', async () => {
    const harness = createHarness({ ...breakOptions, rows: { plans: null, workout_logs: [] } });
    await harness.renderScreen(<BreakScreen platform="ios" />);
    expect(await screen.findByTestId('begin')).toBeTruthy();
  });
});
