import { act, screen, userEvent, within } from '@testing-library/react-native';
import { Alert, Pressable, Text } from 'react-native';

import { usePlan } from '@/plan/PlanProvider';
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

describe('TodayScreen: the allowance for new plans', () => {
  const makeNewPlan = async () => {
    await user().press(screen.getByTestId('new-plan'));
    await confirm(alert, 'Make a new plan');
  };

  it('sends an Idempotency-Key with the request', async () => {
    const fetch = answer({ id: 'plan-2', plan: plan('Desk reset') }, 201);
    const harness = createHarness({ ...base, fetch });
    await harness.renderScreen(<TodayScreen />);
    await screen.findByText('Quick legs');
    await makeNewPlan();
    await screen.findByText('Desk reset');
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['idempotency-key']).toBeTruthy();
  });

  it('shows how many new plans are left once 3 or fewer remain', async () => {
    const usage = { tier: 'free', limit: 2, remaining: 1, resetsAt: '2026-11-19T08:00:00.000Z' };
    const harness = createHarness({ ...base, fetch: answer({ id: 'plan-2', plan: plan('Desk reset'), usage }, 201) });
    await harness.renderScreen(<TodayScreen />);
    await screen.findByText('Quick legs');
    expect(screen.queryByTestId('usage-left')).toBeNull();
    await makeNewPlan();
    expect(await screen.findByText('1 new plan left this week.')).toBeTruthy();
  });

  it('at the limit keeps the plan, says when the next one can be made and mentions Pro once', async () => {
    const at = new Date('2026-11-17T08:00:00');
    const usage = { tier: 'free', limit: 2, remaining: 0, resetsAt: at.toISOString() };
    const harness = createHarness({ ...base, fetch: answer({ error: 'USAGE_LIMIT', message: 'detail', details: usage }, 429) });
    await harness.renderScreen(<TodayScreen />);
    await screen.findByText('Quick legs');
    await makeNewPlan();

    expect(await screen.findByText(/^You have used this week’s new plans\. The next one can be made on .+ at .+\.$/)).toBeTruthy();
    expect(screen.getAllByText('Pro raises this limit.')).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Quick legs')).toBeTruthy();
  });

  it('says the limit where the first plan is made, too', async () => {
    const usage = { tier: 'free', limit: 2, remaining: 0, resetsAt: '2026-11-17T06:00:00.000Z' };
    const harness = createHarness({ ...base, rows: { plans: null, workout_logs: [] }, fetch: answer({ error: 'USAGE_LIMIT', message: 'detail', details: usage }, 429) });
    await harness.renderScreen(<TodayScreen />);
    await user().press(await screen.findByTestId('create-plan'));
    expect(await screen.findByTestId('usage-limit')).toBeTruthy();
  });

  it('does not carry the limit over to another user who signs in on the device', async () => {
    const usage = { tier: 'free', limit: 2, remaining: 0, resetsAt: '2026-11-17T06:00:00.000Z' };
    const harness = createHarness({ ...base, fetch: answer({ error: 'USAGE_LIMIT', message: 'detail', details: usage }, 429) });
    await harness.renderScreen(<TodayScreen />);
    await screen.findByText('Quick legs');
    await makeNewPlan();
    expect(await screen.findByTestId('usage-limit')).toBeTruthy();

    await act(async () => harness.signInAs('user-2'));
    await screen.findByText('Quick legs');
    expect(screen.queryByTestId('usage-limit')).toBeNull();
  });

  it('reads a burst of requests as too many, not as the limit', async () => {
    const harness = createHarness({ ...base, fetch: answer({ error: 'TOO_MANY_REQUESTS', message: 'detail' }, 429) });
    await harness.renderScreen(<TodayScreen />);
    await screen.findByText('Quick legs');
    await makeNewPlan();
    expect(await screen.findByText('You have asked for a lot in a short time. Wait a few minutes and try again.')).toBeTruthy();
    expect(screen.queryByTestId('usage-limit')).toBeNull();
  });

  it('loads the plan again when the same request was already counted', async () => {
    const harness = createHarness({ ...base, fetch: answer({ error: 'DUPLICATE_REQUEST', message: 'detail' }, 409) });
    await harness.renderScreen(<TodayScreen />);
    await screen.findByText('Quick legs');
    await makeNewPlan();
    expect(await screen.findByText('This plan was already asked for. It shows here once it is ready.')).toBeTruthy();
    const plansReads = (harness.services.supabase.from as jest.Mock).mock.calls.filter(([table]) => table === 'plans').length;
    expect(plansReads).toBe(2);
  });
});

describe('TodayScreen: other days of the week', () => {
  // Day 1 "Quick legs", day 2 "Core flow". Made Tuesday 10 Nov; day 1 was done Wednesday 11 Nov.
  const twoDays = {
    ...plan('Quick legs'),
    created_at: '2026-11-10T08:00:00',
    days: [plan('Quick legs').days[0], { day: 2, title: 'Core flow', minutes: 7, blocks: [{ type: 'main', items: [{ exercise_id: 'squat', sets: 2, amount: 10 }] }] }],
  };
  const week: HarnessOptions = {
    profile,
    rows: {
      plans: { id: 'plan-1', plan_json: twoDays, created_at: '2026-11-10T08:00:00' },
      workout_logs: [{ id: 'log-1', plan_id: 'plan-1', day_number: 1, completed_at: '2026-11-11T09:00:00', health_record_id: null }],
    },
  };

  it('opens on today, with today chosen in the week strip', async () => {
    await createHarness(week).renderScreen(<TodayScreen />);
    expect(await screen.findByText('Core flow')).toBeTruthy();
    expect(screen.getByTestId('week-day-2026-11-12').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('start-workout')).toBeTruthy();
  });

  it('shows the session planned for an upcoming day, without starting it', async () => {
    await createHarness(week).renderScreen(<TodayScreen />);
    await screen.findByText('Core flow');
    await user().press(screen.getByTestId('week-day-2026-11-13'));
    expect(screen.getByText('Quick legs')).toBeTruthy();
    expect(screen.getByText('Upcoming if you train every day')).toBeTruthy();
    expect(screen.getByLabelText(/^Main: Plank 1 × 20/)).toBeTruthy();
    expect(screen.queryByTestId('start-workout')).toBeNull();

    await user().press(screen.getByTestId('back-to-today'));
    expect(screen.getByText('Core flow')).toBeTruthy();
    expect(screen.getByTestId('start-workout')).toBeTruthy();
  });

  it('shows a past day as done or as a rest day', async () => {
    await createHarness(week).renderScreen(<TodayScreen />);
    await screen.findByText('Core flow');
    await user().press(screen.getByTestId('week-day-2026-11-11'));
    expect(screen.getByText('Quick legs')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();

    await user().press(screen.getByTestId('week-day-2026-11-10'));
    expect(screen.getByTestId('day-rest')).toBeTruthy();
    expect(screen.queryByText('Quick legs')).toBeNull();

    await user().press(screen.getByTestId('week-day-2026-11-09'));
    expect(screen.getByTestId('day-before-plan')).toBeTruthy();
  });

  it('moves to the next week and back', async () => {
    await createHarness(week).renderScreen(<TodayScreen />);
    await screen.findByText('Core flow');
    await user().press(screen.getByTestId('week-next'));
    expect(screen.getByTestId('week-day-2026-11-16')).toBeTruthy();
    expect(screen.queryByTestId('week-day-2026-11-12')).toBeNull();
    await user().press(screen.getByTestId('week-prev'));
    expect(screen.getByTestId('week-day-2026-11-12')).toBeTruthy();
  });
});

describe('TodayScreen: the week strip keeps up', () => {
  const week: HarnessOptions = {
    profile,
    rows: { plans: { id: 'plan-1', plan_json: plan('Quick legs'), created_at: '2026-11-10T08:00:00' }, workout_logs: [] },
  };
  const isSelected = (day: string) => screen.getByTestId(`week-day-${day}`).props.accessibilityState?.selected;

  it('moves today to the next day at midnight', async () => {
    await createHarness(week).renderScreen(<TodayScreen />);
    await screen.findByText('Quick legs');
    expect(isSelected('2026-11-12')).toBe(true);
    await act(async () => jest.advanceTimersByTime(14 * 60 * 60 * 1000 + 1000));
    expect(isSelected('2026-11-13')).toBe(true);
  });

  it('goes back to today when the plan is replaced', async () => {
    function ReplacePlan() {
      const { replace } = usePlan();
      return (
        <Pressable testID="replace" onPress={() => replace({ id: 'plan-2', plan: plan('Desk reset') as never })}>
          <Text>Replace</Text>
        </Pressable>
      );
    }
    await createHarness(week).renderScreen(
      <>
        <TodayScreen />
        <ReplacePlan />
      </>,
    );
    await screen.findByText('Quick legs');
    await user().press(screen.getByTestId('week-day-2026-11-13'));
    expect(screen.queryByTestId('start-workout')).toBeNull();
    await user().press(screen.getByTestId('replace'));
    expect(screen.getByText('Desk reset')).toBeTruthy();
    expect(screen.getByTestId('start-workout')).toBeTruthy();
    expect(isSelected('2026-11-12')).toBe(true);
  });

  it('says today and done for a session already finished today', async () => {
    await createHarness({
      ...week,
      rows: { ...week.rows, workout_logs: [{ id: 'log-1', plan_id: 'plan-1', day_number: 1, completed_at: '2026-11-12T08:00:00', health_record_id: null }] },
    }).renderScreen(<TodayScreen />);
    await screen.findByTestId('done-today');
    expect(screen.getByTestId('week-day-2026-11-12').props.accessibilityLabel).toBe('Thursday, 12 November, today, done');
  });
});

describe('TodayScreen: kilocalorie estimates', () => {
  const workout = {
    ...plan('Burn check'),
    days: [
      {
        day: 1,
        title: 'Burn check',
        minutes: 10,
        blocks: [
          {
            type: 'main',
            items: [
              { exercise_id: 'squat', sets: 3, amount: 12 },
              { exercise_id: 'plank', sets: 2, amount: 30 },
            ],
          },
        ],
      },
    ],
  };
  const rows = { plans: { id: 'plan-1', plan_json: workout }, workout_logs: [] };

  it('shows an estimate for each exercise and for the whole session, marked as approximate', async () => {
    const harness = createHarness({ ...base, rows });
    await harness.renderScreen(<TodayScreen />);
    await screen.findByText('Burn check');

    // 72 kg: squats 3 x 12 reps of 3 s at MET 5 = 8.6 kcal; plank 60 s at MET 3.5 = 3 kcal
    expect(await screen.findByText('≈ 9 kcal')).toBeTruthy();
    expect(screen.getByText('≈ 3 kcal')).toBeTruthy();
    expect(within(screen.getByTestId('session-kcal')).getByText('≈ 12 kcal')).toBeTruthy();
    expect(screen.getByText(/Calories are estimates/)).toBeTruthy();
  });

  it('shows no calorie figures while the body weight is not known', async () => {
    const harness = createHarness({ ...base, profile: null, rows });
    await harness.renderScreen(<TodayScreen />);
    await screen.findByText('Burn check');

    expect(screen.queryByText(/kcal/)).toBeNull();
    expect(screen.queryByText(/Calories are estimates/)).toBeNull();
  });
});
