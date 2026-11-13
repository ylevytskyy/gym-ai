import { act, screen, userEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { createHarness, type HarnessOptions } from '@/testing/harness';

import { TodayScreen } from './TodayScreen';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

const plan = (title: string) => ({
  schema_version: '1.0.0',
  id: 'plan-json-id',
  created_at: '2026-11-10T09:00:00Z',
  goal: 'move_more',
  notes: '',
  days: [{ day: 1, title, minutes: 5, blocks: [{ type: 'main', items: [{ exercise_id: 'plank', sets: 1, amount: 20 }] }] }],
});
const profile = { id: 'user-1', age_range: '25-34' as const, weight_kg: 72, goal: 'move_more' as const, fitness_level: 1 as const, injuries: [], minutes_per_day: 15, language: 'en' };
const answer = (body: unknown, status = 200) => jest.fn(async () => ({ ok: status < 300, status, json: async () => body }));
const base: HarnessOptions = { profile, rows: { plans: { id: 'plan-1', plan_json: plan('Quick legs') }, workout_logs: [] } };

/** Presses the button with this text in the confirmation that was shown last. */
async function confirm(alert: jest.SpyInstance, text: string) {
  const buttons = alert.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
  await act(async () => buttons.find((button) => button.text === text)?.onPress?.());
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

describe('TodayScreen: a new plan when there is one already', () => {
  it('asks first, then shows the new plan the service made', async () => {
    const fetch = answer({ id: 'plan-2', plan: plan('Desk reset') }, 201);
    const harness = createHarness({ ...base, fetch });
    await harness.renderScreen(<TodayScreen />);
    await screen.findByText('Quick legs');

    await user().press(screen.getByTestId('new-plan'));
    expect(alert.mock.calls[0]?.[0]).toBe('Make a new plan?');
    expect(fetch).not.toHaveBeenCalled();

    await confirm(alert, 'Make a new plan');

    expect(await screen.findByText('Desk reset')).toBeTruthy();
    expect(screen.queryByText('Quick legs')).toBeNull();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://assistant.test/api/plans/generate');
    expect(init.method).toBe('POST');
  });

  it('keeps the current plan and asks the service for nothing when the user cancels', async () => {
    const fetch = answer({ id: 'plan-2', plan: plan('Desk reset') }, 201);
    const harness = createHarness({ ...base, fetch });
    await harness.renderScreen(<TodayScreen />);
    await screen.findByText('Quick legs');

    await user().press(screen.getByTestId('new-plan'));
    await confirm(alert, 'Cancel');

    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText('Quick legs')).toBeTruthy();
  });

  it('keeps the current plan and says so when the service cannot make a new one', async () => {
    const harness = createHarness({ ...base, fetch: answer({ message: 'internal detail' }, 500) });
    await harness.renderScreen(<TodayScreen />);
    await screen.findByText('Quick legs');

    await user().press(screen.getByTestId('new-plan'));
    await confirm(alert, 'Make a new plan');

    expect(await screen.findByText('The plan service is not available right now. Try again later.')).toBeTruthy();
    expect(screen.getByText('Quick legs')).toBeTruthy();
  });
});
