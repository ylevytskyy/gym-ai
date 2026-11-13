import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { createHarness, type HarnessOptions } from '@/testing/harness';

import { HealthSettingsScreen } from './HealthSettingsScreen';
import { PrivacyScreen } from './PrivacyScreen';

const mockRouter = { push: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const profile = { id: 'user-1', age_range: '25-34' as const, weight_kg: 72, goal: 'move_more' as const, fitness_level: 1 as const, injuries: [], minutes_per_day: 15, language: 'en' };
const raw = { steps: [{ day: '2026-11-12', value: 4200 }], activeEnergyKcal: [], restingHrBpm: [], weightKg: [], sleep: [], workouts: [] };
const connected: HarnessOptions = { profile, health: { initial: 'connected', raw }, preferences: { 'health.enabled': 'true', 'health.asked': 'true' } };

/** Presses the button with this text in the confirmation that was shown last. */
function confirm(alert: jest.SpyInstance, text: string) {
  const buttons = alert.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
  buttons.find((button) => button.text === text)?.onPress?.();
}

let alert: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-12T10:00:00'), doNotFake: ['nextTick', 'setImmediate'] });
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => {
  alert.mockRestore();
  jest.useRealTimers();
});
const user = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

describe('PrivacyScreen: health data', () => {
  it('asks first, then deletes the health days, turns Health off, and nothing is synced again', async () => {
    const harness = createHarness(connected);
    await harness.renderScreen(
      <>
        <HealthSettingsScreen platform="ios" />
        <PrivacyScreen platform="ios" />
      </>,
    );
    await screen.findByTestId('health-connected');
    await waitFor(() => expect(harness.synced).toHaveLength(1));

    await user().press(screen.getByTestId('delete-health-data'));
    expect(harness.deleted).toEqual([]);
    expect(alert.mock.calls[0]?.[0]).toBe('Delete your health data?');

    confirm(alert, 'Delete data');

    expect(await screen.findByText('Your health data was deleted and Apple Health is disconnected.')).toBeTruthy();
    expect(harness.deleted).toEqual(['health_days']);
    expect(harness.preferences.get('health.enabled')).toBe('false');
    expect(await screen.findByTestId('health-off')).toBeTruthy();
    // Health is off, which is what stops any later sync (the provider only syncs while connected).
    expect(await harness.services.health.state()).toBe('off');
    expect(harness.synced).toHaveLength(1);
  });

  it('deletes nothing when Health could not be disconnected: rows deleted now would be sent again', async () => {
    const harness = createHarness(connected);
    harness.services.health.disconnect = async () => 'connected';
    await harness.renderScreen(<PrivacyScreen platform="ios" />);
    await user().press(await screen.findByTestId('delete-health-data'));
    confirm(alert, 'Delete data');
    expect(await screen.findByText('Apple Health could not be disconnected, so nothing was deleted. Try again.')).toBeTruthy();
    expect(harness.deleted).toEqual([]);
  });

  it('deletes nothing when the user cancels', async () => {
    const harness = createHarness(connected);
    await harness.renderScreen(<PrivacyScreen platform="ios" />);
    await user().press(await screen.findByTestId('delete-health-data'));
    confirm(alert, 'Cancel');
    expect(harness.deleted).toEqual([]);
    expect(harness.preferences.get('health.enabled')).toBe('true');
  });

  it('says so when the deletion fails; Health stays off so nothing new is sent', async () => {
    const harness = createHarness({ ...connected, deleteFails: true });
    await harness.renderScreen(<PrivacyScreen platform="ios" />);
    await user().press(await screen.findByTestId('delete-health-data'));
    confirm(alert, 'Delete data');
    expect(await screen.findByText('Your health data could not be deleted. Check your connection and try again.')).toBeTruthy();
    expect(harness.preferences.get('health.enabled')).toBe('false');
  });
});

describe('PrivacyScreen: chat and account', () => {
  it('clears the conversation after asking', async () => {
    const harness = createHarness({ profile });
    await harness.renderScreen(<PrivacyScreen platform="ios" />);
    await user().press(await screen.findByTestId('clear-chat'));
    confirm(alert, 'Clear');
    expect(await screen.findByText('Your conversation was cleared.')).toBeTruthy();
    expect(harness.deleted).toEqual(['assistant_messages']);
  });

  it('deletes the account through the service after asking, then signs out', async () => {
    const fetch = jest.fn(async () => ({ ok: true, status: 204, json: async () => null }));
    const harness = createHarness({ ...connected, fetch });
    await harness.renderScreen(<PrivacyScreen platform="ios" />);

    await user().press(await screen.findByTestId('delete-account'));
    expect(fetch).not.toHaveBeenCalled();
    confirm(alert, 'Delete account');

    await waitFor(() => expect(harness.auth.signOut).toHaveBeenCalled());
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://assistant.test/api/account');
    expect(init.method).toBe('DELETE');
    expect(init.headers).toMatchObject({ authorization: 'Bearer token' });
    expect(harness.preferences.get('health.enabled')).toBe('false');
  });

  it('keeps the user signed in and says so when the account could not be deleted', async () => {
    const harness = createHarness({ profile, fetch: jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) });
    await harness.renderScreen(<PrivacyScreen platform="ios" />);
    await user().press(await screen.findByTestId('delete-account'));
    confirm(alert, 'Delete account');
    expect(await screen.findByText('Your account could not be deleted right now. Try again later.')).toBeTruthy();
    expect(harness.auth.signOut).not.toHaveBeenCalled();
  });

  it('says what is stored and what never leaves the phone', async () => {
    const harness = createHarness({ profile });
    await harness.renderScreen(<PrivacyScreen platform="android" />);
    expect(await screen.findByText(/one summary per day/)).toBeTruthy();
    expect(screen.getByText(/never leave your phone/)).toBeTruthy();
    expect(screen.getByText(/not medical advice/)).toBeTruthy();
  });
});
