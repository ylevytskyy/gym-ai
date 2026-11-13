# Google Play: Health Connect declaration (draft)

Written 2026-11-13 from what the build does. Google reviews each requested permission against
a stated use; the list must match `apps/mobile/app.config.ts` exactly.

## Permissions and their use

| Permission | Use in the app |
|---|---|
| `READ_STEPS` | Daily step total for the health day; steps of the last hour to time break reminders |
| `READ_ACTIVE_CALORIES_BURNED` | Daily active energy in the health day |
| `READ_RESTING_HEART_RATE` | Daily average, to judge readiness for today's session |
| `READ_SLEEP` | Minutes asleep last night, to lighten the session after a short night |
| `READ_WEIGHT` | Offered for the profile; stored in the health day; the most recent value is part of the summary the AI coach receives |
| `READ_EXERCISE` | Workouts from other apps today, so the session becomes mobility work |
| `WRITE_EXERCISE` | Saves the workout the user finished in Aura Fit |
| `WRITE_ACTIVE_CALORIES_BURNED` | Saves that workout's estimated active energy |
| `READ_HEALTH_DATA_IN_BACKGROUND` | Reads steps while the app is closed, only after the user turns on break reminders, to move the next reminder and refresh the daily summaries |

App category for the declaration: fitness. No permission is requested that the table does not use.

## Data handling statements

- Only one summary per day leaves the device; individual records do not.
- Health Connect data is not used for advertising, not sold, and not shared except with the
  processors named in the privacy policy (database host; AI model provider, which receives a
  short summary only: averages and a few latest values).
- The user can disconnect, delete the stored health data, and delete the account inside the app.

## Other Play Console items

- **Data safety form:** Health info, Fitness info, Email address, Messages (conversation with
  the AI coach) — collected, not shared for advertising, encrypted in transit, deletable on request
  in the app.
- **Privacy policy:** must be reachable in the app and at a public URL. Health Connect also
  opens the app to show it from its permission screen.
- **Notifications:** `POST_NOTIFICATIONS`, requested when break reminders are turned on.

## To be filled in or checked before submitting

- The public privacy policy URL.
- The real package name (the project still uses the placeholder `app.aurafit.mobile`).
- Whether the Health Connect permission screen's "privacy policy" link opens the in-app privacy
  screen: not verified in this build.
- Break reminders and background reading were checked on an emulator only (spec open question 1).
