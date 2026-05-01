# Fitness API

NestJS API scaffolded for OAuth authentication, provider-swappable LLM calls, and lean Docker deployment.

## Start locally

```bash
yarn install
cp .env.example .env
yarn start:dev
```

Google OAuth is available at `GET /api/auth/google`. The callback issues a JWT response.

LLM calls are available at `POST /api/llm/chat` with a bearer token.

## Architecture

- `auth`: JWT issuance, Google OAuth strategy, and provider-shaped user identities. Apple and email auth can be added as new strategies/services without changing controllers that consume `CurrentUser`.
- `llm`: application-facing `LlmClient` interface with an OpenRouter adapter. Claude, DeepSeek, Gemini, or direct OpenAI-style APIs can be added as new providers behind the same token.
- `common/config`: typed environment access and validation.
- `health`: lightweight liveness endpoint for containers and orchestrators.

## Docker

```bash
docker build -t fitness-api .
docker run --env-file .env -p 3000:3000 fitness-api
```

The image uses a multi-stage build, installs production dependencies only in the runtime image, runs as the non-root `node` user, and cleans Yarn cache from runtime layers.
