# Monetization plan

Status: model decided 2026-11-13; nothing built yet. First slice: server-side Pro entitlement and AI
usage limits (see "Build order").

The coach and plan generation call a paid model (`OPENROUTER_MODEL`, currently
`deepseek/deepseek-v4-flash`). Payments go only through Apple in-app purchase and Google Play
Billing.

## Decided model (2026-11-13)

Goal: earn money without pushing people away. The free tier is genuinely useful on its own; Pro is
something people choose, never something they are pushed into.

- **Free + Pro subscription. No credits, no consumable packs.** AI costs cents per user a month
  (see "Measured model cost"), so a credit wallet only adds a counter people dislike. Free users get
  a daily AI allowance that resets; Pro removes it.
- **Pricing does not mirror model cost.** Pro sells an adaptive coach for people who sit all day and
  have no equipment; the AI coach is one part of it.
- **Users see limits as actions** (coach messages, new plans), never as tokens. Tokens and cost stay
  an internal server metric.
- **Not doing:** ads, any use of user data for money, credits, a paywall that opens by itself.

| | Free | Pro |
|---|---|---|
| Training | player, plans, history, basic exercise set | all exercises with 3D animations, new ones monthly |
| Adjustments | none | today's session adapts to sleep, resting heart rate, steps, external workouts |
| Progress | workout history | trends, monthly reports, streaks, links to steps, sleep, weight |
| Workday mode | basic sitting reminders | schedule, 2-5 minute micro-workouts (assumed, not asked) |
| AI coach | 10 messages a day, 2 new plans a week | no visible limit; fair-use limits below |

Free limits: 10 coach messages per calendar day and 2 new plans per rolling 7 days. The app shows
what is left only when 3 or fewer remain. At the limit the coach says when it resets and mentions
Pro once, in one line. Worst-case cost of a free user at the limit is about $0.09 a month.

Pro fair-use limits (users should not normally see them): 20 new plans a month, 150 coach messages a
day. At the limit the coach says it resets tomorrow.

## Prices

| Product | Store type | Price | Trial |
|---|---|---|---|
| Pro monthly | auto-renewable subscription | $2.99 / month | 7 days free |
| Pro annual | auto-renewable subscription, same group | $24.99 / year ($2.08 / month, −30%) | 7 days free |

Prices are in USD; each store sets local prices from its own tiers. Prices live in App Store Connect
and Play Console, so changing them needs no code. A trial is given once per store account (the
stores enforce this). The app reminds the user 2 days before the trial ends.

When Pro ends: plans, history and health data stay. Pro features lock again and the free AI
allowance applies.

## Paywall

The paywall never opens by itself. It shows only when the user:

- taps a Pro feature (a locked exercise, adjustments, reports, workday schedule);
- taps "Pro" in settings;
- taps the one-line Pro mention after reaching the free AI limit.

Screen content: headline about the adaptive coach, three short benefits, annual option pre-selected
with the trial and per-month price, monthly option, main button ("Try 7 days free"), then the
store-required lines: price after the trial, auto-renewal, how to cancel, Restore purchases, Terms,
Privacy. Closing it is always one tap.

## Later (not in the first version)

- **Programs** ("30 days for a desk worker's back", "stairs instead of a gym") as one-time purchases
  (non-consumable). Pro would include them or discount them.
- Audio cues during a workout (recorded ahead, no cost per play).
- Widgets, Live Activity, Apple Watch.
- Family subscription (store family sharing).
- B2B: wellness seats for companies with remote staff.
- Check 2-3 competitors' free/paid split and prices before release.

## Build order

1. **Server-side entitlement and AI usage limits** (first slice). Supabase migration 010: who is Pro
   and until when, plus usage counters per user and action. A Postgres function checks the limit and
   records the use atomically before the model call, idempotent per request id, and releases the use
   if the model call fails. The assistant service rejects over-limit requests with a clear error the
   app can show. Pro status is written only by the server (later by the RevenueCat webhook), never by
   the client. Testable without any store.
2. **RevenueCat.** `react-native-purchases` in `apps/mobile` (Expo), StoreKit 2 and Play Billing
   behind it. The server trusts signed RevenueCat webhooks, not the client: purchase, renewal,
   cancellation, expiry, refund, each updating the entitlement. Needs a paid Apple Developer account.
3. **Paywall screen and Pro locks in the app.**
4. **Device binding** (App Attest on iOS, Play Integrity on Android) against scripts calling the API
   outside the app and mass account creation. Lower priority than before: without free credits there
   is no balance to farm.
5. **Store rules check** before release: guideline 3.1.2 (subscriptions, trials, disclosure) against
   the current text.

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
