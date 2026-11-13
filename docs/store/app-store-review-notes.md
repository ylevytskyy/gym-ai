# App Store review notes (draft)

Written 2026-11-13 from what the build does. Check every line against the build you submit.

## HealthKit

- **Why the app uses it:** to adjust the day's workout to recent sleep and resting heart rate,
  to plan around workouts recorded by other apps, to offer weight and age range when the
  profile is created, and to save the workouts finished in Aura Fit.
- **Reads:** step count, active energy, resting heart rate, sleep analysis, body mass, workouts,
  date of birth.
- **Writes:** workouts and their active energy. Nothing else.
- **Where the user sees it:** Health tab (connect, today's totals, disconnect), Today tab
  ("Adjusted for today" with the reason), History tab (14-day trends), the workout summary
  ("Added to Apple Health").
- **Background delivery** (`com.apple.developer.healthkit.background-delivery`): step count
  only, hourly, and only after the user turns on break reminders. It moves the time of the next
  local reminder and refreshes the daily summaries.
- **Data handling:** only one summary per day is stored on our server; individual samples never
  leave the device. Health data is not used for advertising and is not sold (guideline 5.1.3).
  Health data is not stored in iCloud.
- **Not a medical app:** readiness is presented as a training suggestion; the app and the AI
  coach give no diagnosis and no medical advice.

## Account deletion (guideline 5.1.1(v))

Health tab → Privacy and account → Delete my account. The account and all stored data are
deleted immediately; no email or support contact is needed.

## AI coach

The Coach tab sends the user's message, profile, current plan and a short health summary
(averages and a few latest values) to a language model. The model cannot write to the database.
It can ask the server for two things: a changed plan, which is checked against the exercise
catalog and the user's injuries before it is stored, and adding an injury the user reported to
the profile, from a fixed list. An injury is never removed this way.

## Notifications

Local notifications only (break reminders), requested when the user turns them on.

## How to test

1. Sign in with the demo account (to be created; see below).
2. Health tab → Connect Apple Health → allow all.
3. Today → Start workout → finish → Save: the workout appears in the Health app.
4. Health tab → Turn on break reminders.
5. Coach tab → "make it easier": the plan on Today changes.

## To be filled in before submitting

- Demo account email and one-time code arrangement (sign-in is by emailed code).
- Privacy policy URL (the published form of `docs/privacy.md`).
- The real bundle identifier (the project still uses the placeholder `app.aurafit.mobile`).
- App Privacy answers in App Store Connect, from the table in `docs/privacy.md`: Health,
  Fitness, Email Address, User Content (conversation), all linked to the user, none for tracking.
