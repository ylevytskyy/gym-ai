# Health integration — plan for milestone 6 (chat, history, store readiness)

Goal: the user can talk to the assistant and have it change the plan, see what they did and how
their health days moved, and delete what the app holds about them. The documents both stores
ask for exist as drafts.

Spec: [spec.md](spec.md). Written 2026-11-13.

## Decisions made here (the user may object)

- **Chat can change the plan, through the validator only.** The model answers with a reply and,
  optionally, an instruction to adjust the plan and injuries to add to the profile. The server
  applies them: an adjusted plan must pass the same schema, catalog and injury checks as a new
  one, or the old plan stays. The model never writes to the database itself.
- **"My knee hurts" adds the injury to the profile.** Adding an injury only ever restricts what
  a plan may contain, so it is safe to take from a chat message; removing one is not offered.
- **Replies are not streamed** in this build (the README sketches streaming). One request, one
  reply; the app shows a waiting state.
- **Deleting the account is included**, because the App Store requires it of an app that
  creates accounts. It needs the service (only the secret key may delete a user).
- **Out of this build:** the weekly background plan refresh and the Anthropic provider (spec
  open question 5 is unanswered, and nothing here depends on them); rate limiting of the
  assistant endpoints (none exists for plan generation either; listed in the review notes).

## Global constraints

- Never trust model output: every plan is validated before it is stored; injuries are taken
  only from the known list; a reply is plain text, capped in length.
- The model sees the health summary only, never health days or readings.
- Readiness and health trends are described as training information, never as a health
  assessment; the assistant gives no diagnosis and tells a user in pain to stop.
- Health data never appears in logs.
- The app holds only the publishable key; account deletion and chat storage happen in the service.

## Seam

- Service: `createApp(deps)` with injected fakes; `OpenRouterAssistant` with a fake chat client.
- Database: `supabase/tests/run-local.sh`.
- App: screens through the harness with a fake `fetch` and fake Supabase.
- Device: both simulators against local Supabase and the real service code with a canned model
  (no live model call is made on the user's key).

## Slices

### Slice 1 — Adjust a plan (service)

- **Files:** `services/assistant/src/providers/openrouter.ts`, `types.ts`, `api/server.ts`,
  `api/validation.ts`, `tools/database.ts`, `index.ts`, tests.
- **Produces:** `Assistant.adjustPlan(profile, plan, feedback, context?)`;
  `POST /api/plans/adjust { feedback }` → `201 { id, plan }`; `AppDeps.loadActivePlan`.
- **Acceptance:** the adjusted plan is validated like a new one and stored; an invalid result
  after the retry is a 400 and nothing is stored; no active plan is a 404; feedback over 500
  characters or empty is a 400; no token is a 401.
- **Verify:** `cd services/assistant && npx vitest run && npx tsc --noEmit`

### Slice 2 — Chat (service)

- **Files:** same service files plus `src/providers/chat-prompt.ts`, migration
  `008_assistant_messages_delete.sql`, `supabase/tests/rls_tests.sql`.
- **Produces:** `Assistant.chat(input) → { reply, adjustPlan?, addInjuries? }`;
  `POST /api/chat { message }` → `200 { reply, plan: { id, plan } | null, injuries_added }`;
  `AppDeps.loadMessages`, `storeMessages`, `addInjuries`.
- **Acceptance:** the reply is stored with the user's message; unknown injuries are dropped;
  an injury is added before the plan is adjusted, so the validator enforces it; a failed
  adjustment keeps the old plan and the reply says so; model output that is not the expected
  JSON becomes a plain apology, never an error page; the prompt holds the health summary and
  no health day; users can delete their own messages and nobody else's.
- **Verify:** as slice 1, plus `supabase/tests/run-local.sh`

### Slice 3 — Delete account (service)

- **Produces:** `DELETE /api/account` → `204`; `AppDeps.deleteAccount`.
- **Acceptance:** deletes the authenticated user and nobody else; 401 without a token; a
  failure is a 500 with no detail.

### Slice 4 — Chat tab (app)

- **Files:** `apps/mobile/src/chat/{repository,ChatScreen}.ts(x)`, `src/app/(tabs)/chat.tsx`.
- **Acceptance:** earlier messages load; sending shows the message at once and the reply when
  it arrives; a changed plan reloads Today and is announced; a failure keeps the typed text and
  says what to do.

### Slice 5 — History tab (app)

- **Files:** `src/history/{model,repository}.ts`, `src/screens/HistoryScreen.tsx`,
  `src/app/(tabs)/history.tsx`.
- **Acceptance:** finished workouts are listed newest first with date, minutes and rating; the
  last 14 health days show averages and day-by-day bars for steps and sleep; a day without data
  shows no bar and is not counted as zero; without Health the trends are replaced by an invitation.

### Slice 6 — Privacy and account (app)

- **Files:** `src/screens/PrivacyScreen.tsx`, `src/app/privacy.tsx`, `src/account/repository.ts`,
  Health tab link.
- **Acceptance:** "Delete my health data" asks first, deletes every `health_days` row of the
  user, turns Health off, and a later foreground sends nothing; "Clear chat" deletes the
  messages; "Delete account" asks first, calls the service and signs out.

### Slice 7 — Documents

- `docs/privacy.md` (draft policy text, also the source of the in-app summary),
  `docs/store/app-store-review-notes.md`, `docs/store/play-health-connect-declaration.md`.

## Order

1 → 2 → 3, then 4, 5, 6, 7; full checks; simulators; independent review.

## Outcome (2026-11-13)

Built as planned, with these additions from the independent review:

- A plan is checked against the profile **as it is at the moment of storing**, not only as it
  was when the request began, on all three endpoints.
- Injuries are added by one database statement (`add_profile_injuries`, service only), so two
  requests at once cannot lose one.
- When an injury was added and no safe plan could be made, the old plan is archived and Today
  offers to make a new one; the reply says so.
- One model request per user at a time, and 30 per 10 minutes (in memory, per process).
- All plan-change attempts of one chat message share 30 seconds, so the service answers well
  inside the 90 seconds the app waits. After a failed send the app loads the plan again.
- The text of a plan adjustment is no longer written to debug logs.
- The Coach and History tabs load again each time they are opened.

Known and left for the user to decide:

- An injury added from chat cannot be removed in the app: there is no profile editing screen.
- Adjusted and generated plans are held to day count, minutes and fitness level by the prompt
  only; the validator enforces schema, catalog and injuries (as before this milestone).
- Replies are not streamed; the weekly background refresh and a second model provider are not built.
