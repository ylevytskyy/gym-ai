/**
 * Authentication middleware helper
 * Requirements: 18.2, 18.4
 *
 * Verifies the Supabase JWT from the Authorization header and returns the user id.
 */

import type { Request } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getDatabaseClient } from '../tools/database.js';
import { AuthenticationError } from '../types.js';

/** The part of the Supabase client used to verify tokens. Tests pass a fake. */
export type AuthClient = Pick<SupabaseClient, 'auth'>;

const BEARER = /^Bearer\s+(\S+)$/i;

export async function authenticateRequest(
  req: Pick<Request, 'headers'>,
  auth: AuthClient = getDatabaseClient(),
): Promise<string> {
  const match = BEARER.exec(req.headers.authorization ?? '');
  if (!match) {
    throw new AuthenticationError();
  }

  let user: { id: string } | null | undefined;
  try {
    const result = await auth.auth.getUser(match[1]!);
    user = result.data.user;
  } catch {
    // A failed verification (network or otherwise) is treated as unauthenticated.
    throw new AuthenticationError();
  }

  if (!user) {
    throw new AuthenticationError();
  }
  return user.id;
}
