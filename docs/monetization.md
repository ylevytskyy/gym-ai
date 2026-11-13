# Monetization plan

Status: planning. Nothing here is built yet. Decided on 2026-11-13.

The coach and plan generation call a paid model (`OPENROUTER_MODEL`, currently
`deepseek/deepseek-v4-flash`), so AI use must be paid for. Payments go only through Apple in-app
purchase and Google Play Billing.

## Direction

- Users see limits as actions (plans, coach messages), never as model tokens. Model tokens and cost
  stay an internal server metric.
- Preferred model: a free tier plus a Pro subscription with fair-use limits. Credit packs for people
  who hit a limit can come later. To be confirmed in the subscription design (priority 4).

## Priorities, in order

1. **Device binding against abuse.** App Attest on iOS, Play Integrity on Android. Stops one person
   collecting the free allowance many times with new accounts, and stops scripts calling the API
   outside the app. The server checks the attestation before granting the free allowance and on
   AI requests.
2. **RevenueCat integration.** `react-native-purchases` in `apps/mobile` (Expo), StoreKit 2 and
   Play Billing behind it. The server trusts RevenueCat webhooks (signed), not the client:
   purchase, renewal, cancellation, expiry, refund.
3. **Balance and limits on the server only.** Supabase: an append-only ledger
   (`credit_ledger` or usage counters), balance derived from it. Debit atomically in a Postgres
   function before the model call, idempotent per request id, refund the debit if the call fails.
   Refund webhooks claw credits back. Balance is tied to the Supabase account (consumables are not
   restored by "Restore purchases"). Deleting stored data warns that the balance is lost.
4. **Subscription design, planned carefully.** Tiers, prices (monthly/annual), free allowance,
   fair-use limits per action, trial, what happens at the limit, store review rules (check
   guideline 3.1.1 on credit expiry and 3.1.2 on subscriptions against the current text),
   paywall placement. Based on the measured cost below.

## Measured model cost

Measured 2026-11-13: 25 real OpenRouter calls through `OpenRouterAssistant` (the service code
itself, with a client wrapper that records `usage`), model `deepseek/deepseek-v4-flash`. Cost is
the `usage.cost` OpenRouter reported for each call, in USD. Listed price at the time:
$0.09 per 1M input tokens, $0.18 per 1M output, $0.018 per 1M cached input.

Test profile: beginner, 20 min/day, one injury, no health data, Ukrainian chat messages.

| Action | Calls | Avg input tokens | Avg output tokens | Avg cost | Max cost | Avg time |
|---|---|---|---|---|---|---|
| New 7-day plan | 3 | 13,921 | 3,376 | $0.0028 | $0.0045 | 29 s |
| Adjust plan | 2 | 15,817 | 3,230 | $0.0016 | $0.0024 | 36 s |
| Coach message, history < 10 turns | 5 | 1,260 | 368 | $0.00022 | $0.00034 | 3.5 s |
| Coach message, history 10-19 | 5 | 1,809 | 529 | $0.00029 | $0.00046 | 3.8 s |
| Coach message, history 20 (cap) | 10 | 2,113 | 216 | $0.00020 | $0.00045 | 2.6 s |

Total for all 25 calls: $0.016.

What this means:

- One plan costs about a third of a cent; one coach message about 0.02-0.03 cents. Most of the plan
  input is the exercise catalog and schema sent in the system prompt.
- Worst cases not measured: a plan that fails validation runs a second attempt (about double), and
  a coach message that changes the plan also runs an adjust (message + adjust, about $0.002).
- A very heavy user (30 messages a day, 10 plans a month) costs about $0.30 a month at these prices.
  Store fees on even the cheapest price tier are larger than that, so limits here protect against
  abuse and against a pricier model, not against ordinary use.
- The cost depends on the model. The Anthropic provider (`ANTHROPIC_MODEL`) was not measured; its
  price per token is likely much higher (unverified). Re-measure before switching models.
- Plan generation takes 29-36 s, close to the app's 55 s timeout.
- Sample is small (25 calls, one profile). Long-term numbers should come from logging `usage` on
  every call in production (not built yet).
