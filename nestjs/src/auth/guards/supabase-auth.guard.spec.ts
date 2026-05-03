import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

import { SupabaseAuthVerifier } from '../../supabase/supabase-auth.verifier';
import { SupabaseAuthGuard } from './supabase-auth.guard';

interface MockRequest {
  headers: Record<string, string | undefined>;
  user?: unknown;
}

function contextWithRequest(request: MockRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: <T = MockRequest>() => request as T,
    }),
  } as unknown as ExecutionContext;
}

describe('SupabaseAuthGuard', () => {
  const verify = jest.fn();
  const verifier = { verify } as unknown as SupabaseAuthVerifier;
  const guard = new SupabaseAuthGuard(verifier);

  beforeEach(() => {
    verify.mockReset();
  });

  it('rejects requests without an Authorization header', async () => {
    const request: MockRequest = { headers: {} };
    await expect(
      guard.canActivate(contextWithRequest(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects requests with a non-Bearer scheme', async () => {
    const request: MockRequest = {
      headers: { authorization: 'Basic abc' },
    };
    await expect(
      guard.canActivate(contextWithRequest(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects requests when the verifier throws', async () => {
    verify.mockRejectedValueOnce(new Error('expired'));
    const request: MockRequest = {
      headers: { authorization: 'Bearer abc' },
    };
    await expect(
      guard.canActivate(contextWithRequest(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches user claims to the request on success', async () => {
    verify.mockResolvedValueOnce({
      userId: 'u1',
      email: 'a@b.c',
      role: 'authenticated',
    });
    const request: MockRequest = {
      headers: { authorization: 'Bearer the-token' },
    };

    await expect(guard.canActivate(contextWithRequest(request))).resolves.toBe(
      true,
    );
    expect(request.user).toEqual({
      userId: 'u1',
      email: 'a@b.c',
      role: 'authenticated',
      accessToken: 'the-token',
    });
  });
});
