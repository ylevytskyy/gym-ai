# Spec: Pro entitlement and AI usage limits (server)

Status: draft, 2026-11-13. First slice of `docs/monetization.md` § "Build order". No store, no app UI.

## Goal

The assistant service knows whether a user is Pro and enforces the AI allowance before it calls the
model, so the limits in `docs/monetization.md` hold no matter what the client sends.

## Terms

- **Pro**: a user whose entitlement row has `expires_at` in the future. Written only by the server
  (service role); later by the RevenueCat webhook. Users can read their own row, never write it.
- **Use**: one counted AI action: `chat_message` (`POST /api/chat`) or `new_plan`
  (`POST /api/plans/generate` and `POST /api/plans/adjust`). A plan change triggered from chat is
  part of the chat message and is not a separate use.
- **Local day**: midnight to midnight in the user's IANA time zone (`profiles.timezone`, default
  `UTC` until the app sends one).
- **Allowance**: free: 10 `chat_message` per local day, 2 `new_plan` per rolling 7 days. Pro (fair use):
  150 `chat_message` per local day, 20 `new_plan` per rolling 30 days. Because the user can change
  their time zone, `chat_message` is also capped at twice the daily limit per rolling 24 hours.

## Behaviour

1. Supabase migration `010`: `profiles.timezone` (IANA name, checked against `pg_timezone_names`,
   default `UTC`), `entitlements` (user_id, tier, expires_at, source, updated_at) and an
   append-only `ai_usage` (id, user_id, action, request_id unique per user, status `reserved` /
   `used` / `released`, created_at). RLS: users select their own rows; no client insert/update.
2. Postgres function `reserve_ai_use(user, action, request_id)`: in one transaction, locks the
   user's profile row, reads the tier and time zone, counts `reserved` + `used` rows in the window,
   and either inserts a `reserved` row and returns `{ allowed: true, remaining, resets_at }` or
   returns `{ allowed: false, remaining: 0, resets_at }`. `resets_at` is the latest moment among the
   limits that block the user. A request id seen before and not released is a duplicate:
   `{ allowed: false, duplicate: true }`, so a replay never runs the model twice. A request id whose
   use was released is counted again.
3. `finish_ai_use(id, ok)`: marks `used` as soon as the model has answered, `released` when no answer
   came (model error or timeout). A failure after the answer (storing the plan, an injury conflict)
   still counts, so it cannot make a model call free.
4. Service: before the model call each AI endpoint reserves. Over the limit: HTTP 429 `USAGE_LIMIT`
   with `details: { tier, limit, remaining: 0, resetsAt }`. A duplicate: HTTP 409
   `DUPLICATE_REQUEST`. Success responses carry `usage: { tier, limit, remaining, resetsAt }` so the
   app can show the count when 3 or fewer remain. The existing in-memory burst gate (30 per 10 min)
   stays.
5. Request id: the app sends `Idempotency-Key` (1-100 visible ASCII characters); the service stores
   it as `<action>:<key>`. If missing, the service generates one (no retry protection then).
6. If the usage store is unreachable, the request fails with 503 `USAGE_UNAVAILABLE` (fail closed),
   not a free call.
7. Known cost, accepted: a chat message that adds an injury can run up to 3 model calls (chat, adjust,
   generate) for one counted use. A request that times out is released although the model call may
   still finish and cost money; the burst gate bounds this.

## Definition of done

- Unit tests in `services/assistant` show: the 11th free chat message in a local day gets 429
  `USAGE_LIMIT`; the 3rd free plan in 7 days gets 429; a Pro user (future `expires_at`) passes those
  points; a user with past `expires_at` is treated as free; a failed model call does not count; the
  same `Idempotency-Key` twice counts once.
- A test against local Supabase shows 20 parallel `reserve_ai_use` calls for a free user produce
  exactly 10 allowed chat uses.
- A signed-in client cannot insert or update `entitlements` or `ai_usage` (RLS test).
- `npx vitest run` and `npx tsc --noEmit` exit 0 in `services/assistant`.

## Deliberately does NOT do

- No RevenueCat, store products, webhooks or paywall UI.
- No app changes beyond what is needed later to read `USAGE_LIMIT` (separate slice).
- No credits, balances or purchases.
- No device binding.
- No app code that sends the time zone (next slice); until then every user counts in UTC.

## Alternatives considered

- **Count from existing tables** (`assistant_messages`, `plans`) instead of a usage table: no new
  table, but counting and inserting are not atomic, failed calls are hard to tell apart, and deleting
  chat history would reset the limit. Rejected.
- **Limits in memory in the service** (like the burst gate): lost on restart and wrong with more
  than one instance. Rejected.

## Open questions

Resolved 2026-11-13: adjust counts as a new plan; the day follows the user's time zone; Pro fair-use
limits are enforced from day one.

- Changing the time zone can give a second day's allowance within 24 hours, never more (the 24-hour
  cap; tested by hopping zones every hour). Is that acceptable, or should time zone changes also be
  limited? (Draft: acceptable.)
- Who writes `profiles.timezone`: the app through the existing profile update, or the service from a
  request header? (Draft: the app, through the existing profile update.)

## Next implementation step

Write migration `010` with `entitlements`, `ai_usage` and `reserve_ai_use`, test-first against
local Supabase.
