/**
 * Authentication middleware tests (Supabase client faked)
 * Requirements: 18.2, 18.4
 */

import { describe, it, expect, vi } from 'vitest';
import { authenticateRequest, type AuthClient } from '../src/api/auth';
import { AuthenticationError } from '../src/types';

function fakeAuth(impl: (jwt: string) => Promise<unknown>) {
  const getUser = vi.fn(impl);
  return { client: { auth: { getUser } } as unknown as AuthClient, getUser };
}

const reqWith = (authorization?: string) =>
  ({ headers: authorization === undefined ? {} : { authorization } }) as any;

describe('authenticateRequest', () => {
  it('returns the user id for a valid Bearer token and verifies it with Supabase', async () => {
    const { client, getUser } = fakeAuth(async () => ({ data: { user: { id: 'user-1' } }, error: null }));

    const userId = await authenticateRequest(reqWith('Bearer good-token'), client);

    expect(userId).toBe('user-1');
    expect(getUser).toHaveBeenCalledWith('good-token');
  });

  it('accepts a lowercase bearer scheme', async () => {
    const { client } = fakeAuth(async () => ({ data: { user: { id: 'user-2' } }, error: null }));
    expect(await authenticateRequest(reqWith('bearer abc'), client)).toBe('user-2');
  });

  it('rejects a missing Authorization header without calling Supabase', async () => {
    const { client, getUser } = fakeAuth(async () => ({ data: { user: null }, error: null }));

    await expect(authenticateRequest(reqWith(undefined), client)).rejects.toThrow(AuthenticationError);
    expect(getUser).not.toHaveBeenCalled();
  });

  it('rejects a non-Bearer scheme', async () => {
    const { client, getUser } = fakeAuth(async () => ({ data: { user: null }, error: null }));

    await expect(authenticateRequest(reqWith('Basic dXNlcjpwYXNz'), client)).rejects.toThrow(AuthenticationError);
    expect(getUser).not.toHaveBeenCalled();
  });

  it('rejects a token Supabase does not accept', async () => {
    const { client } = fakeAuth(async () => ({ data: { user: null }, error: { message: 'invalid JWT' } }));

    await expect(authenticateRequest(reqWith('Bearer bad'), client)).rejects.toThrow(AuthenticationError);
  });

  it('treats a verification failure as an authentication failure', async () => {
    const { client } = fakeAuth(async () => {
      throw new Error('network down');
    });

    await expect(authenticateRequest(reqWith('Bearer x'), client)).rejects.toThrow(AuthenticationError);
  });
});
