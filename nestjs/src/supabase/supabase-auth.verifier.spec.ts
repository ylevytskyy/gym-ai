import { ConfigService } from '@nestjs/config';
import { jwtVerify, createRemoteJWKSet } from 'jose';

import { AppConfig } from '../common/config/app.config';
import { SupabaseAuthVerifier } from './supabase-auth.verifier';

const mockedJwtVerify = jwtVerify as jest.MockedFunction<typeof jwtVerify>;
const mockedCreateRemoteJWKSet = createRemoteJWKSet as jest.MockedFunction<
  typeof createRemoteJWKSet
>;

function makeVerifier(
  url = 'https://example.supabase.co',
): SupabaseAuthVerifier {
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'supabase.url') return url;
      throw new Error(`Unexpected config key ${key}`);
    }),
  } as unknown as ConfigService<AppConfig, true>;

  return new SupabaseAuthVerifier(config);
}

describe('SupabaseAuthVerifier', () => {
  beforeEach(() => {
    mockedJwtVerify.mockReset();
    mockedCreateRemoteJWKSet.mockReset();
    mockedCreateRemoteJWKSet.mockReturnValue('jwks-handle' as never);
  });

  it('builds the JWKS URL from SUPABASE_URL', () => {
    makeVerifier('https://abc.supabase.co');

    expect(mockedCreateRemoteJWKSet).toHaveBeenCalledTimes(1);
    const arg = mockedCreateRemoteJWKSet.mock.calls[0][0];
    expect(arg.toString()).toBe(
      'https://abc.supabase.co/auth/v1/.well-known/jwks.json',
    );
  });

  it('verifies tokens with the correct issuer, audience, and algorithms', async () => {
    const verifier = makeVerifier('https://abc.supabase.co');
    mockedJwtVerify.mockResolvedValueOnce({
      payload: {
        sub: 'user-1',
        email: 'a@b.c',
        role: 'authenticated',
        session_id: 'sess-1',
      },
      protectedHeader: { alg: 'ES256' },
    } as never);

    const claims = await verifier.verify('token');

    expect(mockedJwtVerify).toHaveBeenCalledWith('token', 'jwks-handle', {
      issuer: 'https://abc.supabase.co/auth/v1',
      audience: 'authenticated',
      algorithms: ['ES256', 'RS256'],
    });
    expect(claims).toEqual({
      userId: 'user-1',
      email: 'a@b.c',
      role: 'authenticated',
      sessionId: 'sess-1',
    });
  });

  it('defaults role to "authenticated" when missing', async () => {
    const verifier = makeVerifier();
    mockedJwtVerify.mockResolvedValueOnce({
      payload: { sub: 'user-2' },
      protectedHeader: { alg: 'ES256' },
    } as never);

    const claims = await verifier.verify('token');

    expect(claims.role).toBe('authenticated');
    expect(claims.email).toBeUndefined();
    expect(claims.sessionId).toBeUndefined();
  });

  it('throws when the payload has no sub claim', async () => {
    const verifier = makeVerifier();
    mockedJwtVerify.mockResolvedValueOnce({
      payload: {},
      protectedHeader: { alg: 'ES256' },
    } as never);

    await expect(verifier.verify('token')).rejects.toThrow(/missing the `sub`/);
  });

  it('propagates verification errors (e.g. expired tokens)', async () => {
    const verifier = makeVerifier();
    mockedJwtVerify.mockRejectedValueOnce(new Error('JWT expired'));

    await expect(verifier.verify('token')).rejects.toThrow('JWT expired');
  });
});
