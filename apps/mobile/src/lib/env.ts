/**
 * Build-time configuration. Every EXPO_PUBLIC_* value is compiled into the app and readable by
 * anyone, so only values that are safe to ship belong here (see .env.example).
 *
 * Expo inlines these only when they are written out as process.env.NAME, so each one is read
 * by name here and nowhere else.
 */

export interface Env {
  appEnv: 'local' | 'staging' | 'production';
  supabaseUrl: string;
  supabasePublishableKey: string;
  assistantUrl: string;
}

type Source = Record<'EXPO_PUBLIC_APP_ENV' | 'EXPO_PUBLIC_SUPABASE_URL' | 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY' | 'EXPO_PUBLIC_ASSISTANT_URL', string | undefined>;

const APP_ENVS = ['local', 'staging', 'production'] as const;

/** The `role` claim of a JWT, without verifying it; undefined when the text is not a JWT. */
function jwtRole(token: string): string | undefined {
  const payload = token.split('.')[1];
  if (!payload) return undefined;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const role: unknown = (JSON.parse(globalThis.atob(base64)) as { role?: unknown }).role;
    return typeof role === 'string' ? role : undefined;
  } catch {
    return undefined;
  }
}

function isPublishableKey(key: string): boolean {
  return /^sb_publishable_/.test(key) || jwtRole(key) === 'anon';
}

export function parseEnv(source: Source): Env {
  const need = (name: keyof Source): string => {
    const value = source[name]?.trim();
    if (!value) throw new Error(`${name} is not set. Copy apps/mobile/.env.example to .env and fill it in.`);
    return value;
  };
  const url = (name: keyof Source): string => {
    const value = need(name);
    if (!/^https?:\/\/\S+$/.test(value)) throw new Error(`${name} must be an http(s) URL, got "${value}".`);
    return value.replace(/\/+$/, '');
  };

  // Unset means production, so anything meant for developers stays off unless asked for.
  const appEnv = (source.EXPO_PUBLIC_APP_ENV?.trim() || 'production') as Env['appEnv'];
  if (!APP_ENVS.includes(appEnv)) throw new Error(`EXPO_PUBLIC_APP_ENV must be one of ${APP_ENVS.join(', ')}, got "${appEnv}".`);

  const supabasePublishableKey = need('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  // A secret key in the app would give every user full database access, so only the two
  // kinds of key that are safe to ship are accepted: a publishable key, or a legacy anon key.
  if (!isPublishableKey(supabasePublishableKey)) {
    throw new Error('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be the publishable key (sb_publishable_...), never a secret or service-role key.');
  }

  return {
    appEnv,
    supabaseUrl: url('EXPO_PUBLIC_SUPABASE_URL'),
    supabasePublishableKey,
    assistantUrl: url('EXPO_PUBLIC_ASSISTANT_URL'),
  };
}

export function readEnv(): Env {
  return parseEnv({
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    EXPO_PUBLIC_ASSISTANT_URL: process.env.EXPO_PUBLIC_ASSISTANT_URL,
  });
}
