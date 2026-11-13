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
- **Allowance**: free: 10 `chat_message` per UTC day, 2 `new_plan` per rolling 7 days. Pro (fair use):
  150 `chat_message` per UTC day, 20 `new_plan` per rolling 30 days.

## Behaviour

1. Supabase migration `010`: `entitlements` (user_id, tier, expires_at, source, updated_at) and an
   append-only `ai_usage` (id, user_id, action, request_id unique per user, status `reserved` /
   `used` / `released`, created_at). RLS: users select their own rows; no client insert/update.
2. Postgres function `reserve_ai_use(user, action, request_id)`: in one transaction, takes a
   per-user lock, reads the tier, counts `reserved` + `used` rows in the window, and either inserts a
   `reserved` row and returns `{ allowed: true, remaining, resets_at }` or returns
   `{ allowed: false, remaining: 0, resets_at }`. Same `request_id` twice returns the first result
   without a second row.
3. `finish_ai_use(id, ok)`: marks `used` on success, `released` on model failure, so a failed call
   does not cost the user.
4. Service: before the model call each AI endpoint reserves; over the limit it answers HTTP 429 with
   code `USAGE_LIMIT`, `remaining: 0`, `resetsAt`, `tier`. Success responses carry `usage:
   { remaining, resetsAt }` so the app can show the count when 3 or fewer remain. The existing
   in-memory burst gate (30 per 10 min) stays.
5. Request id: the app sends `Idempotency-Key`; if missing, the service generates one (no retry
   protection in that case).
6. If the usage store is unreachable, the request fails with 503 (fail closed), not a free call.

## Definition of done

- Unit tests in `services/assistant` show: the 11th free chat message in a UTC day gets 429
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
- No per-user time zone: days are UTC.

## Alternatives considered

- **Count from existing tables** (`assistant_messages`, `plans`) instead of a usage table: no new
  table, but counting and inserting are not atomic, failed calls are hard to tell apart, and deleting
  chat history would reset the limit. Rejected.
- **Limits in memory in the service** (like the burst gate): lost on restart and wrong with more
  than one instance. Rejected.

## Open questions

- Should `POST /api/plans/adjust` count as a new plan, or be free like a plan change from chat?
  (Draft: counts.)
- Is a UTC day acceptable, or should the day follow the user's time zone (needs a profile field)?
  (Draft: UTC for now; Kyiv users reset at 02:00 or 03:00 local.)
- Should Pro fair-use limits be enforced from day one, or only logged at first? (Draft: enforced.)

## Next implementation step

Write migration `010` with `entitlements`, `ai_usage` and `reserve_ai_use`, test-first against
local Supabase.
