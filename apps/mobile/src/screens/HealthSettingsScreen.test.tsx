import { screen, userEvent, waitFor } from '@testing-library/react-native';

import { createHarness } from '@/testing/harness';

import { describeToday, HealthSettingsScreen } from './HealthSettingsScreen';
import { TodayScreen } from './TodayScreen';

const today = {
  steps: [{ day: '2026-11-12', value: 4200 }],
  activeEnergyKcal: [],
  restingHrBpm: [],
  weightKg: [],
  sleep: [{ start: new Date('2026-11-11T23:00:00'), end: new Date('2026-11-12T06:30:00') }],
  workouts: [],
};

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-12T10:00:00'), doNotFake: ['nextTick', 'setImmediate'] });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('describeToday', () => {
  it('says "No data" for a missing measurement and shows a real zero as 0', () => {
    const rows = describeToday({ day: '2026-11-12', tz: 'Europe/Kyiv', platform: 'ios', steps: 0 });
    expect(rows.find((r) => r.label === 'Steps')!.value).toBe('0');
    expect(rows.find((r) => r.label === 'Sleep last night')!.value).toBe('No data');
    expect(describeToday(null).every((r) => r.value === 'No data' || r.value === 'None today')).toBe(true);
  });
});

describe('HealthSettingsScreen', () => {
  it('connects from off, shows today, and remembers the choice', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const harness = createHarness({ health: { raw: today } });
    await harness.renderScreen(<HealthSettingsScreen platform="ios" />);

    expect(await screen.findByTestId('health-off')).toBeTruthy();
    expect(screen.queryByTestId('health-today')).toBeNull();

    await user.press(screen.getByTestId('connect-health'));

    expect(await screen.findByTestId('health-connected')).toBeTruthy();
    expect(screen.getByText('Steps: 4200')).toBeTruthy();
    expect(screen.getByText('Sleep last night: 7 h 30 min')).toBeTruthy();
    expect(screen.getByText('Resting heart rate: No data')).toBeTruthy();
    expect(harness.preferences.get('health.enabled')).toBe('true');
    expect(harness.store.connectCalls).toBe(1);
  });

  it('does not ask on launch: the request is shown only when the user presses connect', async () => {
    const harness = createHarness();
    await harness.renderScreen(<HealthSettingsScreen platform="ios" />);
    await screen.findByTestId('health-off');
    expect(harness.store.connectCalls).toBe(0);
  });

  it('explains a denied request on Android and opens Health Connect instead of asking again', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const harness = createHarness({ health: { platform: 'android', grants: false }, preferences: { 'health.asked': 'true' } });
    await harness.renderScreen(<HealthSettingsScreen platform="android" />);

    expect(await screen.findByText(/Aura Fit has no access to Health Connect/)).toBeTruthy();
    expect(harness.store.connectCalls).toBe(0);

    await user.press(screen.getByTestId('open-settings'));
    expect(harness.store.settingsOpened).toBe(1);
  });

  it('says so when the phone has no health store, with nothing to press', async () => {
    const harness = createHarness({ health: { initial: 'unavailable' } });
    await harness.renderScreen(<HealthSettingsScreen platform="ios" />);

    expect(await screen.findByText(/Apple Health is not available on this device/)).toBeTruthy();
    expect(screen.queryByTestId('connect-health')).toBeNull();
  });

  it('asks the user to install or update Health Connect when it is needed', async () => {
    const harness = createHarness({ health: { initial: 'needs_update', platform: 'android' } });
    await harness.renderScreen(<HealthSettingsScreen platform="android" />);
    expect(await screen.findByTestId('health-needs-update')).toBeTruthy();
  });

  it('disconnects: totals disappear, the choice is stored, and system access is explained', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const harness = createHarness({ health: { initial: 'connected', raw: today }, preferences: { 'health.enabled': 'true', 'health.asked': 'true' } });
    await harness.renderScreen(<HealthSettingsScreen platform="ios" />);

    expect(await screen.findByText('Steps: 4200')).toBeTruthy();
    expect(screen.getByText(/To remove its access completely, turn it off in the Health app/)).toBeTruthy();

    await user.press(screen.getByTestId('disconnect-health'));

    await waitFor(() => expect(screen.queryByTestId('health-today')).toBeNull());
    expect(screen.getByTestId('health-off')).toBeTruthy();
    expect(harness.preferences.get('health.enabled')).toBe('false');
  });
});

describe('signing out', () => {
  it('turns Health off for the next person on this phone', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const harness = createHarness({
      health: { initial: 'connected', raw: today },
      preferences: { 'health.enabled': 'true', 'health.asked': 'true' },
      profile: { id: 'user-1', age_range: '25-34', weight_kg: 72, goal: 'move_more', fitness_level: 1, injuries: [], minutes_per_day: 15, language: 'en' },
    });
    await harness.renderScreen(
      <>
        <TodayScreen />
        <HealthSettingsScreen platform="ios" />
      </>,
    );
    await screen.findByTestId('health-connected');

    await user.press(await screen.findByTestId('sign-out'));

    await waitFor(() => expect(harness.auth.signOut).toHaveBeenCalled());
    expect(harness.preferences.get('health.enabled')).toBe('false');
    // Found on the simulator: the screens kept saying "connected" after sign-out.
    expect(await screen.findByTestId('health-off')).toBeTruthy();
    expect(screen.queryByTestId('health-today')).toBeNull();
    expect(await harness.services.health.readToday()).toBeNull();
  });
});
