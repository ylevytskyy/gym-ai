# Aura Fit — privacy text (draft)

Status: draft written 2026-11-13 from what the code does. It is not legal advice and has not
been reviewed by a lawyer. Before publishing, fill in the items under "To be filled in" and have
it reviewed. The short version shown in the app (Health tab → Privacy and account) must say the
same things; change both together.

## What Aura Fit stores

| What | Where it comes from | Why |
|---|---|---|
| Email address | You, at sign-in | To sign you in with a one-time code |
| Profile: age range, weight, goal, fitness level, injuries, minutes per day, language | You, in the app; an injury can also be added when you tell the coach about it | To build workouts that fit you and avoid exercises that conflict with an injury |
| Workout plans | Made by the AI coach, checked by the app's rules before being stored | To show your sessions |
| Workout logs: date, duration, sets done, your rating, the id of the record written to your health store | The app, when you save a session | History, and to avoid writing a workout twice |
| Conversation with the coach | You and the AI coach | So the conversation continues where it stopped |
| Health days: one summary per calendar day with steps, active energy, resting heart rate, minutes asleep, weight, and workouts recorded by other apps (type, minutes, energy) | Apple Health (HealthKit) or Health Connect, only after you connect it in the app | To lighten or strengthen today's session, and to plan around the activity you already do |

## What never leaves your phone

Individual readings: heart-rate series, sleep stages, step samples, routes, and anything the app
does not list above. The phone reduces them to the daily summary before anything is sent.
Break-reminder settings and the times of reminders stay on the phone too.

## Health data rules

- Nothing is read from or written to Apple Health or Health Connect until you connect it in the
  app, and nothing after you disconnect.
- The app writes only the workouts you finish in Aura Fit, with their active energy.
- Health data is used only to adjust your training. It is never used for advertising, never
  sold, and never shared with data brokers.
- Aura Fit is not a medical device. Readiness and trends are training information, not a health
  assessment, and the coach gives no medical advice.

## Who else receives data

- **Supabase** (database and sign-in): stores everything in the first table.
- **The AI model provider, through OpenRouter**: receives, with each request, your profile
  (without your email), your current plan, your recent conversation, and a short summary of
  your health days: 14-day averages (steps, active energy, sleep, resting heart rate), last
  night's sleep, yesterday's steps, your most recent weight, today's readiness, and the count,
  minutes and types of workouts from other apps in the last week. It never receives individual
  readings, and never the full list of your health days.

## Your choices

- **Disconnect** Apple Health or Health Connect in the Health tab at any time.
- **Delete my health data**: removes every health day stored for you and disconnects.
- **Clear my conversation**: removes every message between you and the coach.
- **Delete my account**: removes your account, profile, plans, workout logs, conversation and
  health days for good.
- Workouts Aura Fit wrote to Apple Health or Health Connect stay there until you delete them
  in that app; Aura Fit cannot remove them after the account is gone.

## Notifications

Break reminders are created on the phone itself. No push service is involved and no
notification token is collected.

## To be filled in before publishing

- Who the data controller is (name, address, contact email).
- Where the Supabase project is hosted, and the retention period of its backups.
- Which model provider(s) OpenRouter may route to, and their data-retention terms.
- The minimum age for using the app.
- The legal basis for processing health data in each market (for the EU: explicit consent).
