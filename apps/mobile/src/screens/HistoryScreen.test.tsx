import { screen } from '@testing-library/react-native';

import { createHarness } from '@/testing/harness';

import { HistoryScreen } from './HistoryScreen';

const profile = { id: 'user-1', age_range: '25-34' as const, weight_kg: 72, goal: 'move_more' as const, fitness_level: 1 as const, injuries: [], minutes_per_day: 15, language: 'en' };
const logs = [
  { id: 'l2', day_number: 2, duration_minutes: 12, rating: 4, completed_at: '2026-11-12T07:30:00', health_record_id: 'hk-1', exercises_completed: [{ exercise_id: 'plank', sets_done: 2 }, { exercise_id: 'squat', sets_done: 3 }] },
  { id: 'l1', day_number: 1, duration_minutes: 8, rating: null, completed_at: '2026-11-03T18:00:00', health_record_id: null, exercises_completed: [] },
];
const raw = {
  steps: [
    { day: '2026-11-10', value: 4000 },
    { day: '2026-11-12', value: 8000 },
  ],
  activeEnergyKcal: [],
  restingHrBpm: [],
  weightKg: [],
  sleep: [{ start: new Date('2026-11-11T23:00:00'), end: new Date('2026-11-12T06:00:00') }],
  workouts: [],
};

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-12T10:00:00'), doNotFake: ['nextTick', 'setImmediate'] });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('HistoryScreen', () => {
  it('lists finished workouts newest first with date, minutes, sets and rating', async () => {
    const harness = createHarness({ profile, rows: { workout_logs: logs } });
    await harness.renderScreen(<HistoryScreen platform="ios" />);

    expect(await screen.findByText('This week: 1 workout, 12 min')).toBeTruthy();
    const rows = screen.getAllByTestId(/^log-/).map((node) => node.props.testID);
    expect(rows).toEqual(['log-l2', 'log-l1']);
    expect(screen.getByText('12 Nov · Day 2 · 12 min · 5 sets · felt 4 of 5 · in Apple Health')).toBeTruthy();
    expect(screen.getByText('3 Nov · Day 1 · 8 min')).toBeTruthy();
  });

  it('says so when nothing was finished yet', async () => {
    const harness = createHarness({ profile, rows: { workout_logs: [] } });
    await harness.renderScreen(<HistoryScreen platform="ios" />);
    expect(await screen.findByTestId('history-empty')).toBeTruthy();
  });

  it('shows health trends with a bar only for days that have data', async () => {
    const harness = createHarness({
      profile,
      rows: { workout_logs: [] },
      health: { initial: 'connected', raw },
      preferences: { 'health.enabled': 'true' },
    });
    await harness.renderScreen(<HistoryScreen platform="ios" />);

    expect(await screen.findByText('Steps: 6000 a day on average')).toBeTruthy();
    expect(screen.getByText('Sleep: 7 h 0 min a night on average')).toBeTruthy();
    expect(screen.getByText('Resting heart rate: no data')).toBeTruthy();
    expect(screen.getAllByTestId(/^steps-bar-/).map((node) => node.props.testID)).toEqual(['steps-bar-2026-11-10', 'steps-bar-2026-11-12']);
    expect(screen.getByText(/not a health assessment/)).toBeTruthy();
  });

  it('invites to connect Health instead of showing empty trends', async () => {
    const harness = createHarness({ profile, rows: { workout_logs: [] } });
    await harness.renderScreen(<HistoryScreen platform="android" />);
    expect(await screen.findByText(/Connect Health Connect on the Health tab/)).toBeTruthy();
    expect(screen.queryByTestId('trends')).toBeNull();
  });
});
