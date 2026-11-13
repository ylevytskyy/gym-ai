import { screen, userEvent } from '@testing-library/react-native';

import { createHarness } from '@/testing/harness';

import { SignInScreen } from './SignInScreen';

describe('SignInScreen', () => {
  it('sends a code to the email, then signs in with the code', async () => {
    const user = userEvent.setup();
    const harness = createHarness({ signedIn: false });
    await harness.renderScreen(<SignInScreen />);

    await user.type(screen.getByTestId('email-input'), 'Olena@Example.com');
    await user.press(screen.getByTestId('send-code'));

    expect(harness.auth.signInWithOtp).toHaveBeenCalledWith({ email: 'olena@example.com', options: { shouldCreateUser: true } });
    expect(await screen.findByText(/We sent a code to olena@example.com/)).toBeTruthy();

    await user.type(screen.getByTestId('code-input'), '123456');
    await user.press(screen.getByTestId('verify-code'));

    expect(harness.auth.verifyOtp).toHaveBeenCalledWith({ email: 'olena@example.com', token: '123456', type: 'email' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the user on the email step with an explanation when the email is not valid', async () => {
    const user = userEvent.setup();
    const harness = createHarness({ signedIn: false });
    await harness.renderScreen(<SignInScreen />);

    await user.type(screen.getByTestId('email-input'), 'not-an-email');
    await user.press(screen.getByTestId('send-code'));

    expect(await screen.findByText('Enter a valid email address.')).toBeTruthy();
    expect(harness.auth.signInWithOtp).not.toHaveBeenCalled();
    expect(screen.getByTestId('sign-in-email')).toBeTruthy();
  });

  it('shows an error for a wrong code and stays on the code step', async () => {
    const user = userEvent.setup();
    const harness = createHarness({ signedIn: false, codeIsValid: false });
    await harness.renderScreen(<SignInScreen />);

    await user.type(screen.getByTestId('email-input'), 'a@b.co');
    await user.press(screen.getByTestId('send-code'));
    await user.type(await screen.findByTestId('code-input'), '000000');
    await user.press(screen.getByTestId('verify-code'));

    expect(await screen.findByText(/That code is wrong or has expired/)).toBeTruthy();
    expect(screen.getByTestId('sign-in-code')).toBeTruthy();
  });

  it('lets the user go back and use a different email', async () => {
    const user = userEvent.setup();
    const harness = createHarness({ signedIn: false });
    await harness.renderScreen(<SignInScreen />);

    await user.type(screen.getByTestId('email-input'), 'a@b.co');
    await user.press(screen.getByTestId('send-code'));
    await user.press(await screen.findByRole('button', { name: 'Use a different email' }));

    expect(screen.getByTestId('sign-in-email')).toBeTruthy();
  });
});
