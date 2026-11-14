/**
 * Maps a RevenueCat event to the entitlement action the database function applies.
 * The table is in docs/revenuecat-webhook-spec.md, section "Behaviour".
 */

export type EntitlementAction = 'set_expiry' | 'revoke' | 'none';

export interface MappedEvent {
  /** 'sandbox_ignored' means a SANDBOX event arrived while sandbox events are not accepted. */
  action: EntitlementAction | 'sandbox_ignored';
  /** ISO time, set only for 'set_expiry'. */
  expiresAt: string | null;
  eventType: string;
}

export interface MapOptions {
  acceptSandbox: boolean;
  proEntitlement: string;
  nowMs: number;
}

const GRANT_TYPES = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'REFUND_REVERSED']);

/** The largest time a JavaScript Date holds, in ms. Beyond it toISOString() throws a RangeError. */
export const MAX_EPOCH_MS = 8.64e15;

export function mapEvent(event: Record<string, unknown>, options: MapOptions): MappedEvent {
  const eventType = typeof event['type'] === 'string' ? event['type'] : '';
  const none: MappedEvent = { action: 'none', expiresAt: null, eventType };

  const environment = event['environment'];
  if (environment === 'SANDBOX' && !options.acceptSandbox) return { ...none, action: 'sandbox_ignored' };
  if (environment !== 'SANDBOX' && environment !== 'PRODUCTION') return none;

  if (GRANT_TYPES.has(eventType)) {
    const ids = event['entitlement_ids'];
    const expiry = event['expiration_at_ms'];
    if (!Array.isArray(ids) || !ids.includes(options.proEntitlement)) return none;
    if (typeof expiry !== 'number' || !Number.isFinite(expiry) || Math.abs(expiry) > MAX_EPOCH_MS || expiry <= options.nowMs) return none;
    return { action: 'set_expiry', expiresAt: new Date(expiry).toISOString(), eventType };
  }
  // A refund: the docs say CUSTOMER_SUPPORT covers refunds; any other cancel keeps Pro to the period end.
  if (eventType === 'CANCELLATION' && event['cancel_reason'] === 'CUSTOMER_SUPPORT') {
    return { action: 'revoke', expiresAt: null, eventType };
  }
  if (eventType === 'EXPIRATION') return { action: 'revoke', expiresAt: null, eventType };
  return none;
}
