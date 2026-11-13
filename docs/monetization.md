# Monetization plan

Status: planning. Nothing here is built yet. Decided on 2026-11-13.

The coach and plan generation call a paid model (`OPENROUTER_MODEL`, currently
`deepseek/deepseek-v4-flash`), so AI use must be paid for. Payments go only through Apple in-app
purchase and Google Play Billing.

## Direction

- Users see limits as actions (plans, coach messages), never as model tokens. Model tokens and cost
  stay an internal server metric.
- Decided: monthly and annual Pro subscriptions, plus one-time credit packs for people who want to
  use the service once without subscribing. Pro is about $5 a month.

## What Pro sells (direction, 2026-11-13)

Pricing should not mirror model cost. AI costs cents per user a month (see "Measured model cost"),
so it should not be the main paywall. People pay for the outcome: training regularly, seeing
progress, less back pain from sitting. Pro sells an adaptive personal coach for people who sit all
day and have no equipment; the AI coach is one part of it.

Value the app already has, and the paid side of each:

1. **Readiness and adjustments.** Today's session changes from sleep, resting heart rate, steps and
   external workouts. Deterministic, no AI cost per use. Pro.
2. **Progress.** History already shows health trends. Pro: monthly reports, streaks, links between
   workouts and steps, sleep, weight.
3. **Exercise library with 3D animations** (75 exercises, Blender pipeline). Content is made once
   and sold many times. Free: a basic set. Pro: all of it, plus new exercises every month.
4. **Sitting nudges.** A niche big fitness apps cover poorly. Pro "workday mode": a schedule, 2-5
   minute micro-workouts, stairs instead of a gym.

New things worth selling:

- **Programs** ("30 days for a desk worker's back", "stairs instead of a gym") as one-time
  purchases (non-consumable). A clearer "pay once" option than abstract credits. Open question:
  keep credits only for AI actions without a subscription, or drop credits in favour of programs.
- **Audio cues during a workout**, recorded ahead, so no cost per play.
- **Widgets, Live Activity, Apple Watch.**
- **Family subscription** (store family sharing).
- **Later, B2B:** wellness programs sold as seats to companies with remote staff. Fits the niche;
  the largest potential revenue.

Not doing: ads, or any use of user data for money. This is a health app; both hurt trust and store
review.

Proposed split:

| | Free | Pro ($4.99 / $39.99) |
|---|---|---|
| Training | player, 1 plan, basic exercise set | all exercises, new ones monthly |
| Adjustments | none | readiness from health data, automatic changes |
| Progress | workout history | trends, reports, streaks |
| Workday mode | basic nudges | schedule, micro-workouts |
| Coach (AI) | a few messages | no counter (fair-use limits) |
| Separate | programs as one-time purchases | programs discounted or included |

Before fixing prices, look at how 2-3 competitors in this niche split free and paid (not done yet).
The "Offer" section below predates this direction and is to be revised against it.

## Offer (draft, 2026-11-13)

Prices are in USD; each store sets local prices from its own tiers.

| Product | Store type | Price | What it gives |
|---|---|---|---|
| Pro monthly | auto-renewable subscription | $4.99 / month | plans and coach without a counter, fair-use limits below |
| Pro annual | auto-renewable subscription, same group | $39.99 / year ($3.33 / month, −33%) | same as monthly; 7-day free trial |
| 60 credits | consumable | $1.99 | 6 plans or 60 coach messages, or a mix |

Credits:

- 1 new plan = 10 credits. 1 coach message = 1 credit. A coach message that changes the plan costs
  1 credit; the plan change it triggers is free (it is part of the conversation).
- New account: 30 free credits (1 plan + 20 messages), granted once per device (priority 1).
- Purchased credits never expire. Free credits: check whether they may expire under the store rules.
- Pro users do not spend credits. If a Pro user reaches a fair-use limit, the coach says so and the
  limit resets; credits can cover the gap.

Pro fair-use limits (users should not normally see them): 20 new plans a month, 150 coach messages
a day. At the measured worst-case cost this is under $1 a month per user, against $4.24 net of a 15%
store fee on monthly (or roughly $3.49 at 30%).

When a subscription ends: the current plan and history stay; new plans and coach messages use
credits again.

## Paywall

Two surfaces. A mockup was shown in the session; this is the description.

1. **Full paywall** (screen). Headline about the coach, three short benefits, annual option
   pre-selected with the trial and per-month price, monthly option, main button
   ("Try 7 days free" / "Subscribe for $4.99/month"), a quiet link to the credit pack, then the
   store-required lines: auto-renewal, how to cancel, Restore purchases, Terms, Privacy.
2. **Out-of-credits sheet** (bottom sheet). Says what the action costs and the balance
   ("A new plan costs 10 credits. You have 3."), then Pro and the 60-credit pack, "Not now".

When each shows:

- Never before the user's first plan: they see the value first.
- After the first finished workout: full paywall once, closable.
- Whenever an action costs more credits than the balance: the sheet.
- From a "Pro" entry in settings, any time.
- The coach shows the remaining balance only when it is low (5 credits or fewer), so there is no
  counter in normal use.

Open questions: whether to show the paywall after onboarding instead of after the first workout;
whether the trial applies to annual only; the free-credit amount; store rules on trials and
free credits (check the current guidelines).

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
