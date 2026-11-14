# Context — shared vocabulary

Terms as this project uses them. No implementation detail here.

- **Health store** — the phone's own health database: HealthKit on iOS, Health Connect on Android.
  _Avoid:_ "Apple Health", "Google Fit", "health provider".
- **Health day** — one user's totals for one local calendar day (steps, active energy, resting
  heart rate, sleep, weight, external workouts). The only health data the server holds.
  _Avoid:_ "sample", "health record", "daily stats".
- **External workout** — a workout in the health store that Aura Fit did not write.
  _Avoid:_ "third-party activity", "imported workout".
- **Readiness** — a training suggestion for today (`low`, `normal`, `high`, `unknown`) derived
  from recent health days. Not a health assessment.
  _Avoid:_ "recovery score", "health score".
- **Adjustment** — the deterministic change readiness or an external workout makes to today's
  planned session. The plan itself is not rewritten.
  _Avoid:_ "AI adjustment", "re-plan".
- **Sitting nudge** — a local notification offering a short desk break after a long stretch with
  few steps.
  _Avoid:_ "stand reminder", "push".
- **Sync** — copying health days from the phone to the server. Writing a workout to the health
  store is called **writing**, not sync.
- **Connect** — the user granting Aura Fit access to the health store.
  _Avoid:_ "link", "pair".

## Subscriptions

- **Pro** — a user with an entitlement whose end date is in the future. Only the server writes it.
  _Avoid:_ "premium", "subscriber" (for the access itself), "paid user".
- **Refund** — the store returning the price of the latest subscription period. Ends Pro at once.
  _Avoid:_ "chargeback", "reversal" (a reversal undoes a refund).
- **Cancel** — the user turning off renewal. Pro continues until the paid period ends.
  _Avoid:_ "refund", "unsubscribe" (in code, use the RevenueCat event name).
- **Sandbox event** — a RevenueCat event from a test purchase. Production ignores these.
  _Avoid:_ "test event" (the TEST event type is a different thing).
