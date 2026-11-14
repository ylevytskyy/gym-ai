/**
 * Optional RevenueCat webhook settings in the environment configuration.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateConfig } from '../src/config';

const KEYS = ['OPENROUTER_API_KEY', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'REVENUECAT_WEBHOOK_SECRET', 'REVENUECAT_ACCEPT_SANDBOX', 'REVENUECAT_PRO_ENTITLEMENT'];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  process.env.OPENROUTER_API_KEY = 'or-key';
  process.env.SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SECRET_KEY = 'secret';
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('RevenueCat configuration', () => {
  it('leaves the webhook off, sandbox off and the entitlement "pro" by default', () => {
    const config = validateConfig();
    expect(config.revenuecatWebhookSecret).toBeUndefined();
    expect(config.revenuecatAcceptSandbox).toBe(false);
    expect(config.revenuecatProEntitlement).toBe('pro');
  });

  it('reads the secret and a different entitlement id', () => {
    process.env.REVENUECAT_WEBHOOK_SECRET = 'whsec';
    process.env.REVENUECAT_PRO_ENTITLEMENT = 'premium';
    const config = validateConfig();
    expect(config.revenuecatWebhookSecret).toBe('whsec');
    expect(config.revenuecatProEntitlement).toBe('premium');
  });

  it('treats an empty secret as not set', () => {
    process.env.REVENUECAT_WEBHOOK_SECRET = '';
    expect(validateConfig().revenuecatWebhookSecret).toBeUndefined();
  });

  it('accepts sandbox events only for the exact value "true"', () => {
    process.env.REVENUECAT_ACCEPT_SANDBOX = 'true';
    expect(validateConfig().revenuecatAcceptSandbox).toBe(true);
    for (const v of ['false', '1', 'TRUE', 'yes', '']) {
      process.env.REVENUECAT_ACCEPT_SANDBOX = v;
      expect(validateConfig().revenuecatAcceptSandbox).toBe(false);
    }
  });
});
