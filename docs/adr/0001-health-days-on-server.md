# 0001 — The server holds daily health summaries, never raw samples

Date: 2026-11-12. Status: accepted.

## Context

Plan generation, trends and the background plan refresh run on the server, so they need health
data when the app is closed. Health data is the most sensitive data the app touches, and both
app stores review how it is stored.

## Decision

The phone reduces health-store data to one **health day** per user per local day and syncs only
that to Supabase (`health_days`, row-level security, user-initiated delete). Raw samples,
heart-rate series, sleep stages and routes stay on the phone.

## Consequences

- Anything needing finer than daily resolution must be computed on the phone.
- The privacy policy and both store declarations must describe the daily summaries.
- Moving to raw samples later means a new table, a new consent and a new store review; moving to
  no storage means dropping history and background-aware plans.

## Alternatives

- Store nothing, send a summary per request: no trends, nothing when the app is closed.
- Store raw samples: large tables and a heavier review burden for no behaviour in the current
  scope.
