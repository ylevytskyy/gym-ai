/**
 * Sign-in with a one-time code sent by email. The code is typed into the app, so sign-in does
 * not depend on a link opening the right app on the right device.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type AuthClient = Pick<SupabaseClient, 'auth'>;

export type SignInResult = { ok: true } | { ok: false; message: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

/** The code as digits only, or null when it cannot be a code (Supabase sends 6 to 10 digits). */
export function normalizeCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, '');
  return /^\d{6,10}$/.test(code) ? code : null;
}

const OFFLINE = 'No connection. Check your network and try again.';

/** supabase-js reports a request that never reached the server as an error with status 0. */
function isOffline(error: { status?: number | undefined; name?: string | undefined }): boolean {
  return error.status === 0 || error.name === 'AuthRetryableFetchError';
}

export async function sendCode(client: AuthClient, emailInput: string): Promise<SignInResult> {
  const email = normalizeEmail(emailInput);
  if (!email) return { ok: false, message: 'Enter a valid email address.' };
  try {
    const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) {
      if (isOffline(error)) return { ok: false, message: OFFLINE };
      const tooMany = error.status === 429;
      return { ok: false, message: tooMany ? 'Too many attempts. Wait a minute and try again.' : 'Could not send the code. Try again.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}

export async function verifyCode(client: AuthClient, emailInput: string, codeInput: string): Promise<SignInResult> {
  const email = normalizeEmail(emailInput);
  const code = normalizeCode(codeInput);
  if (!email) return { ok: false, message: 'Enter a valid email address.' };
  if (!code) return { ok: false, message: 'Enter the code from the email.' };
  try {
    const { data, error } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error && isOffline(error)) return { ok: false, message: OFFLINE };
    if (error || !data.session) return { ok: false, message: 'That code is wrong or has expired. Check it or request a new one.' };
    return { ok: true };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}
