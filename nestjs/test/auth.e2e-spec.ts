import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';

import { SupabaseAuthVerifier } from '../src/supabase/supabase-auth.verifier';

describe('AuthController (e2e)', () => {
  let app: NestFastifyApplication | undefined;
  const verify = jest.fn();

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
    const { AppModule } = await import('../src/app.module');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SupabaseAuthVerifier)
      .useValue({ verify })
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(() => {
    verify.mockReset();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns 401 without an Authorization header', async () => {
    const response = await app!.inject({
      method: 'GET',
      url: '/api/auth/me',
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 401 when the verifier rejects the token', async () => {
    verify.mockRejectedValueOnce(new Error('expired'));
    const response = await app!.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: 'Bearer bad-token' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns the verified user on success', async () => {
    verify.mockResolvedValueOnce({
      userId: 'u1',
      email: 'a@b.c',
      role: 'authenticated',
      sessionId: 'sess-1',
    });
    const response = await app!.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: 'Bearer good-token' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      userId: 'u1',
      email: 'a@b.c',
      role: 'authenticated',
    });
    expect(verify).toHaveBeenCalledWith('good-token');
  });
});
