import { act, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { identify, logOut } from '@/billing/purchases';
import { createHarness } from '@/testing/harness';

jest.mock('@/billing/purchases', () => ({ identify: jest.fn(async () => {}), logOut: jest.fn(async () => {}) }));

beforeEach(() => jest.clearAllMocks());

describe('AuthProvider: RevenueCat identity follows the session', () => {
  it('identifies the signed-in user by their Supabase user id', async () => {
    const harness = createHarness();
    await harness.renderScreen(<Text>x</Text>);
    await waitFor(() => expect(identify).toHaveBeenCalledWith('user-1'));
    expect(logOut).not.toHaveBeenCalled();
  });

  it('does not log out when nobody was ever signed in', async () => {
    const harness = createHarness({ signedIn: false });
    await harness.renderScreen(<Text>x</Text>);
    expect(identify).not.toHaveBeenCalled();
    expect(logOut).not.toHaveBeenCalled();
  });

  it('logs out on sign-out and identifies the next person who signs in', async () => {
    const harness = createHarness();
    await harness.renderScreen(<Text>x</Text>);
    await waitFor(() => expect(identify).toHaveBeenCalledWith('user-1'));

    await act(async () => {
      await harness.auth.signOut();
    });
    await waitFor(() => expect(logOut).toHaveBeenCalledTimes(1));

    await act(async () => {
      harness.signInAs('user-2');
    });
    await waitFor(() => expect(identify).toHaveBeenLastCalledWith('user-2'));
  });
});
