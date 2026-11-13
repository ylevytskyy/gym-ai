import { screen, userEvent, waitFor } from '@testing-library/react-native';

import { createHarness } from '@/testing/harness';

import { OnboardingScreen } from './OnboardingScreen';

const connected = { 'health.enabled': 'true', 'health.asked': 'true' };
const hints = { weightKg: 78.4, dateOfBirth: '1990-04-15' };

async function fillRest(user: ReturnType<typeof userEvent.setup>) {
  await user.press(screen.getByRole('button', { name: 'Goal: Move more' }));
  await user.press(screen.getByRole('button', { name: 'Level: Beginner' }));
  await user.press(screen.getByRole('button', { name: 'Injuries to work around: Knee' }));
}

describe('OnboardingScreen', () => {
  it('offers the values found in Health and saves nothing until the user accepts and submits', async () => {
    const user = userEvent.setup();
    const harness = createHarness({ health: { initial: 'connected', hints }, preferences: connected });
    await harness.renderScreen(<OnboardingScreen platform="ios" />);

    expect(await screen.findByText(/Apple Health has your weight 78 kg and age range 35-44/)).toBeTruthy();
    // Offered, not applied.
    expect(screen.getByTestId('weight-input').props.value).toBe('');
    expect(harness.upserts).toEqual([]);

    await user.press(screen.getByTestId('use-suggestion'));

    expect(screen.getByTestId('weight-input').props.value).toBe('78');
    expect(screen.getByRole('button', { name: 'Age range: 35-44' }).props.accessibilityState.selected).toBe(true);
    expect(screen.queryByTestId('health-suggestion')).toBeNull();
    expect(harness.upserts).toEqual([]);

    await fillRest(user);
    await user.press(screen.getByTestId('save-profile'));

    await waitFor(() =>
      expect(harness.upserts).toEqual([
        { id: 'user-1', age_range: '35-44', weight_kg: 78, goal: 'move_more', fitness_level: 1, injuries: ['knee_injury'], minutes_per_day: 15, language: 'en' },
      ]),
    );
  });

  it('leaves the form untouched when the user declines the values', async () => {
    const user = userEvent.setup();
    const harness = createHarness({ health: { initial: 'connected', hints }, preferences: connected });
    await harness.renderScreen(<OnboardingScreen platform="ios" />);

    await user.press(await screen.findByTestId('dismiss-suggestion'));

    expect(screen.queryByTestId('health-suggestion')).toBeNull();
    expect(screen.getByTestId('weight-input').props.value).toBe('');
    expect(screen.getByRole('button', { name: 'Age range: 35-44' }).props.accessibilityState.selected).toBe(false);
  });

  it('offers to connect Health when it is off, and shows the values after the user connects', async () => {
    const user = userEvent.setup();
    const harness = createHarness({ health: { hints: { weightKg: 88 }, platform: 'android' } });
    await harness.renderScreen(<OnboardingScreen platform="android" />);

    expect(await screen.findByTestId('health-offer')).toBeTruthy();
    expect(screen.queryByTestId('health-suggestion')).toBeNull();

    await user.press(screen.getByTestId('connect-health'));

    expect(await screen.findByText(/Health Connect has your weight 88 kg/)).toBeTruthy();
    expect(harness.store.connectCalls).toBe(1);
    expect(screen.queryByTestId('health-offer')).toBeNull();
  });

  it('works as an ordinary form when Health is unavailable', async () => {
    const user = userEvent.setup();
    const harness = createHarness({ health: { initial: 'unavailable' } });
    await harness.renderScreen(<OnboardingScreen platform="ios" />);

    await waitFor(() => expect(screen.queryByTestId('health-offer')).toBeNull());
    await user.press(screen.getByRole('button', { name: 'Age range: 25-34' }));
    await user.type(screen.getByTestId('weight-input'), '72');
    await fillRest(user);
    await user.press(screen.getByTestId('save-profile'));

    await waitFor(() => expect(harness.upserts).toHaveLength(1));
    expect(harness.upserts[0]).toMatchObject({ age_range: '25-34', weight_kg: 72 });
  });

  it('shows what is missing and saves nothing for an incomplete form', async () => {
    const user = userEvent.setup();
    const harness = createHarness({ health: { initial: 'unavailable' } });
    await harness.renderScreen(<OnboardingScreen platform="ios" />);

    await user.type(screen.getByTestId('weight-input'), '0');
    await user.press(screen.getByTestId('save-profile'));

    expect(await screen.findByText('Enter your weight in whole kilograms (1 to 499).')).toBeTruthy();
    expect(screen.getByText('Choose your age range.')).toBeTruthy();
    expect(screen.getByText('Choose a goal.')).toBeTruthy();
    expect(harness.upserts).toEqual([]);
  });

  it('clears the complaint about a field as soon as the user changes it', async () => {
    const user = userEvent.setup();
    const harness = createHarness({ health: { initial: 'unavailable' } });
    await harness.renderScreen(<OnboardingScreen platform="ios" />);

    await user.press(screen.getByTestId('save-profile'));
    expect(await screen.findByText('Choose your level.')).toBeTruthy();

    await user.press(screen.getByRole('button', { name: 'Level: Beginner' }));

    expect(screen.queryByText('Choose your level.')).toBeNull();
    expect(screen.getByText('Choose a goal.')).toBeTruthy();
  });

  it('keeps only digits in the number fields', async () => {
    const user = userEvent.setup();
    const harness = createHarness({ health: { initial: 'unavailable' } });
    await harness.renderScreen(<OnboardingScreen platform="ios" />);

    await user.type(screen.getByTestId('weight-input'), '7,2kg');

    expect(screen.getByTestId('weight-input').props.value).toBe('72');
  });

  it('tells the user when saving failed', async () => {
    const user = userEvent.setup();
    const harness = createHarness({ health: { initial: 'unavailable' }, saveFails: true });
    await harness.renderScreen(<OnboardingScreen platform="ios" />);

    await user.press(screen.getByRole('button', { name: 'Age range: 25-34' }));
    await user.type(screen.getByTestId('weight-input'), '72');
    await fillRest(user);
    await user.press(screen.getByTestId('save-profile'));

    expect(await screen.findByText(/Could not save your profile/)).toBeTruthy();
  });
});
