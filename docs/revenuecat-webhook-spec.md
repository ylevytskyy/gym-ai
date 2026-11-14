# Spec: RevenueCat webhook (server)

Status: draft, 2026-11-14. Second slice of `docs/monetization.md` § "Build order" (server side only).
No app SDK, no store products, no paywall. Builds on `docs/usage-limits-spec.md` (migration 010).

## Goal

RevenueCat tells the server when a user's Pro subscription starts, renews, is cancelled, is refunded,
or expires, and the server updates `entitlements` so the AI allowance follows the store, not the client.

## Terms

- **Pro**: a user whose `entitlements` row has `expires_at` in the future (`usage-limits-spec.md`).
- **Refund**: a `CANCELLATION` event with `cancel_reason` `CUSTOMER_SUPPORT`. The docs say this reason
  covers refunds but do not say every refund carries it, so the rule is tested against sandbox events.
- **Sandbox event**: an event whose `environment` is `SANDBOX`.
- **Stale event**: an event whose `event_timestamp_ms` is older than the last event applied to the user.

## Facts used (RevenueCat docs, read 2026-11-14)

- Webhooks carry an optional HMAC signature: header `X-RevenueCat-Webhook-Signature: t=<unix>,v1=<hex>`,
  HMAC-SHA256 over `<t>.<raw body>`. The docs recommend it for stronger verification.
  (`https://www.revenuecat.com/docs/integrations/webhooks`)
- Fields: `id`, `event_timestamp_ms`, `app_user_id`, `original_app_user_id`, `aliases`, `product_id`,
  `entitlement_ids`, `expiration_at_ms`, `environment` (`SANDBOX` | `PRODUCTION`), plus `cancel_reason`
  on `CANCELLATION` and `expiration_reason` on `EXPIRATION`.
  (`https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields`)
- `CANCELLATION` fires on a cancel or on a refund of the latest period. `UNSUBSCRIBE` is a voluntary cancel.
- `EXPIRATION`: access should be removed. `BILLING_ISSUE`: "doesn't mean the subscription has expired".
- Retries reuse the same `id` and `event_timestamp_ms`; up to 5 retries over about 80 minutes; duplicates
  are possible. A non-200 response is a failure and is retried.

## Decisions (made in the grill, 2026-11-14)

1. **Refund ends Pro at once.** A `CUSTOMER_SUPPORT` cancellation sets `expires_at` to the event time.
   A plain cancel (`UNSUBSCRIBE` and others) keeps Pro until `expires_at`. (User's choice.)
2. **Production ignores SANDBOX events.** They change entitlements only when
   `REVENUECAT_ACCEPT_SANDBOX=true`, which is set for dev and staging only. (User's choice.)
3. **Authentication is HMAC only**, not the Authorization header. Reason in "Alternatives".
4. **Unknown users are acknowledged, not retried.** An event whose `app_user_id` is not a `profiles.id`
   returns 200 and writes nothing, so RevenueCat does not retry it for 80 minutes.

## Behaviour

Endpoint: `POST /api/webhooks/revenuecat`. The body is read raw, verified, then parsed as JSON.

Verification (before any read or write):
- Missing or malformed signature header, a `t` more than 5 minutes from now, or an HMAC mismatch → 401.
  Compare with a constant-time function.
- `REVENUECAT_WEBHOOK_SECRET` not set → 503 (the feature is off; the rest of the service still runs).
- Body not JSON → 400.

Mapping, for a verified event with a known user and an allowed environment:

| Event | Effect on `entitlements` for `app_user_id` |
|---|---|
| `INITIAL_PURCHASE`, `RENEWAL`, `PRODUCT_CHANGE`, `UNCANCELLATION`, `REFUND_REVERSED` | Pro: `expires_at = expiration_at_ms`, when `entitlement_ids` contains `REVENUECAT_PRO_ENTITLEMENT` (default `pro`) and `expiration_at_ms` is in the future |
| `CANCELLATION` with `cancel_reason = CUSTOMER_SUPPORT` | Refund: `expires_at = min(expires_at, event_timestamp_ms)` |
| `CANCELLATION` (other reasons) | No change |
| `EXPIRATION` | `expires_at = min(expires_at, event_timestamp_ms)` |
| `BILLING_ISSUE`, `TEST`, `TRANSFER`, anything else | No change, 200 |

Outcome codes for a verified request: 200 for applied, duplicate, stale, ignored, sandbox-ignored and
unknown-user. 500 only when the database write fails, so RevenueCat retries.

Atomicity and order: one Postgres function `apply_revenuecat_event` (migration 011) inserts the event
id into `revenuecat_events` and updates `entitlements` in one transaction. Duplicate ids and stale events
are detected inside that transaction. `entitlements` gets an `event_at` column (the last applied event
time). A webhook write sets `source = 'revenuecat'` and overwrites a manual row.

Privacy: no request body is logged. Logs carry the event id, type, environment and outcome.
`revenuecat_events` stores no user id.

## Definition of done

Each item is a check that can fail:

1. A request with a correct signature and a fresh `t` returns 200. A missing, wrong or 6-minute-old
   signature returns 401 and writes nothing (`api.webhook.test.ts`).
2. The same event id sent twice applies once: the second call returns 200, the entitlement is unchanged,
   and `revenuecat_events` has one row (database test).
3. `INITIAL_PURCHASE` with a future `expiration_at_ms` makes `reserve_ai_use` return tier `pro` with limit
   150 for chat (database test).
4. `CANCELLATION` with `UNSUBSCRIBE` leaves `expires_at` unchanged (database test).
5. `CANCELLATION` with `CUSTOMER_SUPPORT` makes `reserve_ai_use` return tier `free` at once (database test).
6. `EXPIRATION` makes the tier `free` (database test).
7. An event older than `entitlements.event_at` changes nothing and returns 200 `stale` (database test).
8. A `SANDBOX` event changes nothing when `REVENUECAT_ACCEPT_SANDBOX` is unset, and applies when it is `true`.
9. An `app_user_id` with no profile returns 200 and writes nothing.
10. A database error inside `apply_revenuecat_event` returns 500 and leaves no row in `revenuecat_events`
    (simulated with a failing stub at the service seam).
11. Under the local Supabase tests, an authenticated client cannot insert or update `entitlements` or
    `revenuecat_events` (extends the RLS test from migration 010).
12. `npx vitest run` and `npx tsc --noEmit` exit 0 in `services/assistant`.

## Deliberately does NOT do

- No `react-native-purchases`, no app `logIn` call, no paywall, no store products (need the RevenueCat
  and Apple/Google accounts; the app slice comes later).
- No Authorization-header check (HMAC only).
- No handling of `TRANSFER`, `SUBSCRIBER_ALIAS` or `REFUND` as its own type (the docs do not list one).
- No manual grant UI and no admin endpoint. `source = 'manual'` rows are only written by hand.
- No applying migration 011 to cloud Supabase (you run it after review).
- No device binding, no credits.

## Alternatives considered

- **Authorization header instead of HMAC.** Simpler, but the header is not tied to the body. Lost because
  the docs present HMAC as the stronger check and the cost is about the same.
- **Check for a duplicate, then apply, in two steps.** Lost: a crash between the steps drops the event
  for good. The single function makes it atomic.
- **Apply events in arrival order.** Lost: retries can arrive late. Ordering by `event_timestamp_ms` is
  cheap with an `event_at` column.
- **Ask the RevenueCat REST API for the subscriber on each event.** Lost: extra calls, rate limits and a
  second secret. The webhook already carries `expiration_at_ms`.

## Open questions

1. Will you create the RevenueCat webhook integration with HMAC signing turned on, and set
   `REVENUECAT_WEBHOOK_SECRET` in the service environment? (The dashboard is yours.)
2. Is the RevenueCat entitlement identifier `pro`? If not, which value should `REVENUECAT_PRO_ENTITLEMENT` be?
3. Should `REFUND_REVERSED` restore Pro to the current period end (the default here), or should the user
   buy again?

## Next implementation step

Write migration `011_revenuecat_events.sql` (the `revenuecat_events` table, `entitlements.event_at`, and
`apply_revenuecat_event`) and its RLS and function tests, test-first against local Supabase.
