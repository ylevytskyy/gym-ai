/** Test harness: the real providers around a screen, with a fake Supabase and a fake health store. */

import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { AuthProvider } from '@/auth/AuthProvider';
import { createHealthController, type Preferences } from '@/health/controller';
import { createFakeHealthStore, type FakeHealthOptions } from '@/health/fake-store';
import { HealthProvider } from '@/health/HealthProvider';
import { ProfileProvider } from '@/profile/ProfileProvider';
import type { StoredProfile } from '@/profile/repository';
import { ServicesProvider, type Services } from '@/services';

export interface HarnessOptions {
  signedIn?: boolean;
  profile?: StoredProfile | null;
  health?: FakeHealthOptions;
  /** Stored health choices, e.g. { 'health.enabled': 'true' }. */
  preferences?: Record<string, string>;
  /** What verifyOtp answers. */
  codeIsValid?: boolean;
  saveFails?: boolean;
}

export function createHarness(options: HarnessOptions = {}) {
  const session = options.signedIn === false ? null : { user: { id: 'user-1' }, access_token: 'token' };
  let listener: ((event: string, next: unknown) => void) | undefined;
  let storedProfile = options.profile ?? null;
  const upserts: unknown[] = [];

  const auth = {
    getSession: jest.fn(async () => ({ data: { session }, error: null })),
    onAuthStateChange: jest.fn((callback: (event: string, next: unknown) => void) => {
      listener = callback;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    }),
    signInWithOtp: jest.fn(async () => ({ data: {}, error: null })),
    verifyOtp: jest.fn(async () => {
      if (options.codeIsValid === false) return { data: { session: null }, error: { status: 403, message: 'Token has expired or is invalid' } };
      const next = { user: { id: 'user-1' }, access_token: 'token' };
      listener?.('SIGNED_IN', next);
      return { data: { session: next }, error: null };
    }),
    signOut: jest.fn(async () => {
      listener?.('SIGNED_OUT', null);
      return { error: null };
    }),
  };

  const from = jest.fn(() => {
    let upserted: Record<string, unknown> | undefined;
    const builder = {
      select: () => builder,
      eq: () => builder,
      upsert: (row: Record<string, unknown>) => {
        upserted = row;
        upserts.push(row);
        return builder;
      },
      maybeSingle: async () => ({ data: storedProfile, error: null }),
      single: async () => {
        if (options.saveFails) return { data: null, error: { message: 'boom' } };
        storedProfile = upserted as unknown as StoredProfile;
        return { data: storedProfile, error: null };
      },
    };
    return builder;
  });

  const store = createFakeHealthStore(options.health);
  const data = new Map(Object.entries(options.preferences ?? {}));
  const preferences: Preferences = { get: async (key) => data.get(key) ?? null, set: async (key, value) => void data.set(key, value) };

  const services: Services = {
    supabase: { auth, from } as unknown as Services['supabase'],
    health: createHealthController(store, preferences),
    today: () => '2026-11-12',
  };

  const renderScreen = (screen: ReactElement) =>
    render(
      <ServicesProvider services={services}>
        <AuthProvider>
          <ProfileProvider>
            <HealthProvider>{screen}</HealthProvider>
          </ProfileProvider>
        </AuthProvider>
      </ServicesProvider>,
    );

  return { services, auth, store, upserts, preferences: data, renderScreen };
}
