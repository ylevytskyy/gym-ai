import { normalizeCode, normalizeEmail, sendCode, verifyCode, type AuthClient } from './sign-in';

function client(overrides: Record<string, jest.Mock> = {}) {
  const auth = {
    signInWithOtp: jest.fn(async () => ({ data: {}, error: null })),
    verifyOtp: jest.fn(async () => ({ data: { session: { access_token: 't' } }, error: null })),
    ...overrides,
  };
  return { client: { auth } as unknown as AuthClient, auth };
}

describe('normalizeEmail / normalizeCode', () => {
  it('trims and lowercases a valid email and rejects the rest', () => {
    expect(normalizeEmail('  Olena@Example.COM ')).toBe('olena@example.com');
    for (const bad of ['', 'olena', 'olena@', '@example.com', 'a b@example.com', 'olena@example']) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });

  it('accepts a code typed with spaces or a dash and rejects anything else', () => {
    expect(normalizeCode('123 456')).toBe('123456');
    expect(normalizeCode('123-456')).toBe('123456');
    for (const bad of ['', '12345', 'abcdef', '12345a', '12345678901']) expect(normalizeCode(bad)).toBeNull();
  });
});

describe('sendCode', () => {
  it('asks Supabase to email a code to the normalised address', async () => {
    const { client: c, auth } = client();
    expect(await sendCode(c, ' Olena@Example.com ')).toEqual({ ok: true });
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: 'olena@example.com', options: { shouldCreateUser: true } });
  });

  it('does not call Supabase for an invalid email', async () => {
    const { client: c, auth } = client();
    expect(await sendCode(c, 'nope')).toEqual({ ok: false, message: 'Enter a valid email address.' });
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('explains rate limiting, other failures and a lost connection without leaking server text', async () => {
    const limited = client({ signInWithOtp: jest.fn(async () => ({ error: { status: 429, message: 'email rate limit exceeded for 1.2.3.4' } })) });
    expect(await sendCode(limited.client, 'a@b.co')).toEqual({ ok: false, message: 'Too many attempts. Wait a minute and try again.' });

    const failed = client({ signInWithOtp: jest.fn(async () => ({ error: { status: 500, message: 'smtp: dial tcp 10.0.0.5' } })) });
    expect(await sendCode(failed.client, 'a@b.co')).toEqual({ ok: false, message: 'Could not send the code. Try again.' });

    const offline = client({ signInWithOtp: jest.fn(async () => { throw new TypeError('Network request failed'); }) });
    expect((await sendCode(offline.client, 'a@b.co')).ok).toBe(false);
  });
});

describe('verifyCode', () => {
  it('signs in with the email and the code', async () => {
    const { client: c, auth } = client();
    expect(await verifyCode(c, 'a@b.co', '123 456')).toEqual({ ok: true });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'a@b.co', token: '123456', type: 'email' });
  });

  it('rejects a malformed code without calling Supabase', async () => {
    const { client: c, auth } = client();
    expect(await verifyCode(c, 'a@b.co', '12')).toEqual({ ok: false, message: 'Enter the code from the email.' });
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('reports a wrong or expired code, and a response with no session', async () => {
    const wrong = client({ verifyOtp: jest.fn(async () => ({ data: { session: null }, error: { status: 403, message: 'Token has expired or is invalid' } })) });
    expect(await verifyCode(wrong.client, 'a@b.co', '123456')).toEqual({ ok: false, message: 'That code is wrong or has expired. Check it or request a new one.' });

    // supabase-js reports a failed request as an error with status 0 instead of throwing.
    const offline = client({ verifyOtp: jest.fn(async () => ({ data: { session: null }, error: { status: 0, name: 'AuthRetryableFetchError', message: 'Network request failed' } })) });
    expect(await verifyCode(offline.client, 'a@b.co', '123456')).toEqual({ ok: false, message: 'No connection. Check your network and try again.' });
    const offlineSend = client({ signInWithOtp: jest.fn(async () => ({ error: { status: 0, name: 'AuthRetryableFetchError', message: 'Network request failed' } })) });
    expect(await sendCode(offlineSend.client, 'a@b.co')).toEqual({ ok: false, message: 'No connection. Check your network and try again.' });

    const empty = client({ verifyOtp: jest.fn(async () => ({ data: { session: null }, error: null })) });
    expect((await verifyCode(empty.client, 'a@b.co', '123456')).ok).toBe(false);
  });
});
