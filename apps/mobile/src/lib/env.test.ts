import { parseEnv } from './env';

const good = {
  EXPO_PUBLIC_APP_ENV: 'local',
  EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321/',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc',
  EXPO_PUBLIC_ASSISTANT_URL: 'http://127.0.0.1:3101',
};

describe('parseEnv', () => {
  it('reads a complete configuration and trims trailing slashes', () => {
    expect(parseEnv(good)).toEqual({
      appEnv: 'local',
      supabaseUrl: 'http://127.0.0.1:54321',
      supabasePublishableKey: 'sb_publishable_abc',
      assistantUrl: 'http://127.0.0.1:3101',
    });
  });

  it.each(['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'EXPO_PUBLIC_ASSISTANT_URL'] as const)(
    'names %s when it is missing or blank',
    (name) => {
      expect(() => parseEnv({ ...good, [name]: undefined })).toThrow(name);
      expect(() => parseEnv({ ...good, [name]: '  ' })).toThrow(name);
    },
  );

  it('rejects a value that is not a URL and an unknown environment', () => {
    expect(() => parseEnv({ ...good, EXPO_PUBLIC_SUPABASE_URL: 'localhost:54321' })).toThrow(/EXPO_PUBLIC_SUPABASE_URL must be an http/);
    expect(() => parseEnv({ ...good, EXPO_PUBLIC_APP_ENV: 'prod' })).toThrow(/EXPO_PUBLIC_APP_ENV/);
    // Unset means production: developer-only screens must never switch on by omission.
    expect(parseEnv({ ...good, EXPO_PUBLIC_APP_ENV: undefined }).appEnv).toBe('production');
  });

  const jwt = (payload: object) =>
    `eyJhbGciOiJIUzI1NiJ9.${globalThis.btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.sig`;

  it('refuses a secret key, which must never ship in the app', () => {
    expect(() => parseEnv({ ...good, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' })).toThrow(/publishable key/);
    // A legacy service-role key is a JWT: the role is inside the encoded payload.
    expect(() => parseEnv({ ...good, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt({ role: 'service_role' }) })).toThrow(/publishable key/);
    expect(() => parseEnv({ ...good, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'some-other-token' })).toThrow(/publishable key/);
  });

  it('accepts a publishable key and a legacy anon key', () => {
    expect(parseEnv({ ...good, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt({ role: 'anon' }) }).supabasePublishableKey).toContain('eyJ');
    expect(parseEnv(good).supabasePublishableKey).toBe('sb_publishable_abc');
  });
});
