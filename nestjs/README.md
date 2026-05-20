# Fitness API

NestJS API for Supabase-authenticated requests and provider-swappable LLM workflows.

## Start locally

```bash
pnpm install
cp .env.example .env
pnpm start:dev
```

For local debugging:

```bash
pnpm start:debug
```

The API serves routes under `http://127.0.0.1:3000/api`, and the Node debugger listens on `127.0.0.1:9229`.

## Authentication

The API trusts Supabase-issued access tokens. Clients sign in via Supabase Auth and send the resulting access token as `Authorization: Bearer <token>`. The API verifies the token against Supabase's JWKS at `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` and runs PostgREST calls under the user's RLS context.

`GET /api/auth/me` returns the verified user. `POST /api/llm/chat` and `POST /api/llm/workout-plan` require a bearer token.

## Architecture

- `auth`: Supabase JWT verification guard and `CurrentUser` decorator.
- `supabase`: shared Supabase JWKS verifier and per-request client factory.
- `llm`: application-facing `LlmClient` interface with an OpenRouter adapter.
- `common/config`: typed environment access and validation.
- `health`: lightweight liveness endpoint for containers and orchestrators.

## Docker

```bash
docker build -t fitness-api .
docker run --env-file .env -p 3000:3000 fitness-api
```

The image uses a multi-stage build, installs production dependencies only in the runtime image, runs as the non-root `node` user, and cleans Yarn cache from runtime layers.
