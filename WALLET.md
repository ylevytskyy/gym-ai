# Wallet: dev secrets

Every secret the project uses in development: its name, what it is for, where it is issued,
where it is stored, and how to rotate it. This file lists **names and places only**. Values never
go in this file, in git, in a commit message, in a PR, in an issue, in a log, or in a screenshot.

The per-app setup is in [README.md](README.md#configuration). This file is the inventory.

## Rules

- Secrets live in a `.env` file next to each app. Git ignores `services/assistant/.env`,
  `apps/mobile/.env` and `supabase/.env`.
- Only the **publishable** Supabase key goes in the mobile app. Secret keys stay in the AI service
  and the pipelines.
- The AI service does not read `.env` by itself. Export the variables first, as the
  [AI service README](services/assistant/README.md) shows.
- If a value leaks, rotate it at its issuer (table below), update your `.env`, then search git
  history for the old value.

## Inventory

| Name | Used by | Secret | Issued at | Stored in | Rotate |
|---|---|---|---|---|---|
| `SUPABASE_URL` | AI service, pipelines | no | Supabase project. Local: `supabase status -o env` in the local project folder | `services/assistant/.env`, `pipelines/*/.env` | not needed |
| `SUPABASE_SECRET_KEY` (`sb_secret_...`) | AI service, pipelines | **yes** | Supabase project API keys. Local: `supabase status -o env` | `services/assistant/.env`, `pipelines/*/.env` | in the Supabase project's API key settings |
| `OPENROUTER_API_KEY` | AI service | **yes** | OpenRouter account | `services/assistant/.env` | in the OpenRouter account |
| `ANTHROPIC_API_KEY` | AI service (only with `ASSISTANT_PROVIDER=anthropic`) | **yes** | Anthropic console | `services/assistant/.env` | in the Anthropic console |
| `REVENUECAT_WEBHOOK_SECRET` | AI service | **yes** | RevenueCat dashboard: Integrations, then Webhooks, then the webhook, then Signing secret | `services/assistant/.env` | Rotate secret on the same webhook. RevenueCat shows the new value once, so copy it then |
| `REVENUECAT_ACCEPT_SANDBOX` | AI service | no (flag) | You choose | `services/assistant/.env` | Set `true` only on dev and staging |
| `REVENUECAT_PRO_ENTITLEMENT` | AI service | no | RevenueCat entitlement id (`pro`) | `services/assistant/.env` | not needed |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Mobile app | no (built into the app) | Supabase project API keys | `apps/mobile/.env` | not needed |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_ASSISTANT_URL`, `EXPO_PUBLIC_APP_ENV` | Mobile app | no | Your setup | `apps/mobile/.env` | not needed |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI, hosted project only | **yes** | Supabase dashboard, Account, Access Tokens | `supabase/.env` | revoke it in the same place |
| `SUPABASE_PROJECT_REF` | Supabase CLI, hosted project only | no | The part of the project URL before `.supabase.co` | `supabase/.env` | not needed |
| `SUPABASE_DB_PASSWORD` | Supabase CLI, hosted project only | **yes** | Supabase project database settings | `supabase/.env` | reset it in the same place |

Not in use yet, and listed commented out in `supabase/.env.example`: the SMTP password for
production magic-link emails, and the Apple and Google sign-in secrets.

## Kept outside the repo

- **ngrok authtoken:** ngrok keeps it in its own config file. `ngrok config check` prints the path.
  Regenerate it in the ngrok dashboard if it leaks.
- **Local Supabase keys:** `supabase status -o env`, run in the local project folder. They change
  if the local stack is recreated.

## Open decision

This repo does not yet say where production secrets are stored. Decide that before the first
deploy, and record it here.
