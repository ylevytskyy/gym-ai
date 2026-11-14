/**
 * RevenueCat setup and identity. No purchase or paywall code lives here yet.
 *
 * The server learns who is Pro from signed RevenueCat webhooks keyed by app_user_id, so the app
 * must log in to RevenueCat with the Supabase user id (the profile id), never an anonymous id.
 * The SDK key is the public SDK key, safe to ship. Without it every function here does nothing.
 */

import Purchases, { type CustomerInfo } from 'react-native-purchases';

/** The RevenueCat entitlement that means Pro. */
export const PRO_ENTITLEMENT = 'pro';

let configured = false;
let warned = false;

/** Expo inlines EXPO_PUBLIC_* only when written out as process.env.NAME. */
function readKey(): string {
  return process.env.EXPO_PUBLIC_REVENUECAT_PUBLIC_KEY?.trim() ?? '';
}

export function configure(): void {
  if (configured) return;
  const apiKey = readKey();
  if (!apiKey) {
    if (!warned) {
      warned = true;
      console.warn('RevenueCat is off: EXPO_PUBLIC_REVENUECAT_PUBLIC_KEY is not set.');
    }
    return;
  }
  Purchases.configure({ apiKey });
  configured = true;
}

/** Ties purchases to the signed-in person. Billing trouble never blocks signing in. */
export async function identify(userId: string): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logIn(userId);
  } catch (error) {
    console.warn('RevenueCat logIn failed', error);
  }
}

export async function logOut(): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch (error) {
    // The SDK refuses to log out an anonymous user; that is not an error for us.
    console.warn('RevenueCat logOut failed', error);
  }
}

/** True when the Pro entitlement is active. */
export function hasPro(customerInfo: CustomerInfo | null | undefined): boolean {
  return customerInfo?.entitlements?.active?.[PRO_ENTITLEMENT] !== undefined;
}
