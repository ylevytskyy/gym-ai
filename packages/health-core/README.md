# health-core

Deterministic health rules for Aura Fit. Pure TypeScript with no platform imports, so the mobile
app and the AI service run exactly the same code.

| Function | Answers |
|---|---|
| `readiness(days, today)` | Is today a `low`, `normal` or `high` day, or `unknown`, and why |
| `adjustDay(day, input, catalog)` | The workout day to actually show after readiness and external workouts |
| `nudgeDue(input)` | Whether to offer a desk break now |
| `summarize(days, today)` | The health summary the plan generator is told |

Vocabulary is in [`CONTEXT.md`](../../CONTEXT.md); the input shape is
[`schemas/health-day.schema.json`](../../schemas/health-day.schema.json).

Rules worth knowing before changing anything:

- An absent measurement means the health store had no data. It is never treated as zero.
- Readiness is a training suggestion, not a health assessment.
- `adjustDay` never returns an empty block or fewer than one set, never mutates its input, and
  only introduces exercises that are safe for the user's injuries and within their fitness level.
  `services/assistant/tests/health-adjust.property.test.ts` checks this against the real validator
  and catalog.
- The thresholds are exported constants (`SHORT_SLEEP_MINUTES`, `RESTING_HR_RATIO`, and so on).

```bash
npm install     # also builds dist/
npm test
npm run typecheck
npm run build   # after changing src/, so services/assistant picks it up at runtime
```
