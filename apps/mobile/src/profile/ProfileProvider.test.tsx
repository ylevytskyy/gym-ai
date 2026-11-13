import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { deviceTimeZone } from '@/health/local-day';
import { createHarness } from '@/testing/harness';

import { useProfile } from './ProfileProvider';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

const profile = { id: 'user-1', age_range: '25-34' as const, weight_kg: 72, goal: 'move_more' as const, fitness_level: 1 as const, injuries: [], minutes_per_day: 15, language: 'en' };

const { id: _id, ...values } = profile;

/** Shows the stored time zone; pressing it saves the profile, as onboarding does. */
function ProfileZone() {
  const { state, save } = useProfile();
  return (
    <Text testID="zone" onPress={() => void save(values)}>
      {state.status === 'ready' ? (state.profile.timezone ?? 'none') : state.status}
    </Text>
  );
}

const zoneUpdates = (updates: { table: string; row: Record<string, unknown> }[]) => updates.filter((u) => u.table === 'profiles' && 'timezone' in u.row);

// Tests run in Europe/Kyiv (jest.global-setup.js); ICU may name it Europe/Kiev, and Postgres knows both.
const device = deviceTimeZone();
describe('ProfileProvider: the time zone the AI allowance counts days in', () => {
  it('writes the device time zone when the profile has another one', async () => {
    const harness = createHarness({ profile: { ...profile, timezone: 'UTC' } });
    await harness.renderScreen(<ProfileZone />);
    await waitFor(() => expect(screen.getByTestId('zone').props.children).toBe(device));
    expect(zoneUpdates(harness.updates)).toEqual([{ table: 'profiles', row: { timezone: device } }]);
  });

  it('writes nothing when the profile already has it', async () => {
    const harness = createHarness({ profile: { ...profile, timezone: device } });
    await harness.renderScreen(<ProfileZone />);
    await waitFor(() => expect(screen.getByTestId('zone').props.children).toBe(device));
    expect(zoneUpdates(harness.updates)).toEqual([]);
  });

  it('writes it once onboarding has made the profile', async () => {
    const harness = createHarness({ profile: null });
    await harness.renderScreen(<ProfileZone />);
    await waitFor(() => expect(screen.getByTestId('zone').props.children).toBe('missing'));
    expect(zoneUpdates(harness.updates)).toEqual([]);

    await act(async () => fireEvent.press(screen.getByTestId('zone')));
    await waitFor(() => expect(screen.getByTestId('zone').props.children).toBe(device));
    expect(zoneUpdates(harness.updates)).toEqual([{ table: 'profiles', row: { timezone: device } }]);
  });

  it('tries once and keeps the profile when the time zone is refused', async () => {
    const harness = createHarness({ profile: { ...profile, timezone: 'UTC' }, timeZoneFails: true });
    await harness.renderScreen(<ProfileZone />);
    await waitFor(() => expect(zoneUpdates(harness.updates)).toHaveLength(1));
    await act(async () => undefined);
    expect(screen.getByTestId('zone').props.children).toBe('UTC');
    // A later change of the profile (here a save) must not write the refused zone again.
    await act(async () => fireEvent.press(screen.getByTestId('zone')));
    await waitFor(() => expect(screen.getByTestId('zone').props.children).toBe('none'));
    expect(zoneUpdates(harness.updates)).toHaveLength(1);
  });
});
