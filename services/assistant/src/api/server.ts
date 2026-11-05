/**
 * HTTP API: plan generation endpoint, health check, and error handling.
 * Requirements: 18.1, 18.5-18.10, 17.3-17.8
 *
 * Dependencies are injected so the server can be tested without Supabase or
 * OpenRouter. src/index.ts wires in the real ones.
 */

import { randomUUID } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { logger } from '../logger.js';
import { validatePlanRequest } from './validation.js';
import {
  AppError,
  APIError,
  AuthenticationError,
  PlanGenerationError,
  ValidationErrorClass,
  type Assistant,
  type Profile,
  type WorkoutPlan,
} from '../types.js';

const DEFAULT_TIMEOUT_MS = 30_000;

export interface AppDeps {
  assistant: Assistant;
  /** Resolves the user id from the request, or throws AuthenticationError. */
  authenticate: (req: Request) => Promise<string>;
  loadProfile: (userId: string) => Promise<Profile>;
  storePlan: (userId: string, plan: WorkoutPlan, provider: string) => Promise<string>;
  requestTimeoutMs?: number;
}

interface ErrorBody {
  error: string;
  message: string;
  details?: unknown;
  correlationId: string;
}

class TimeoutError extends AppError {
  constructor() {
    super('Plan generation took too long; try again', 'GATEWAY_TIMEOUT', 504);
  }
}

/** Resolve or reject within ms. The slow work is not cancelled; its result is dropped. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/** Map an error to a status and a body that is safe to send to the client (Requirement 17.5-17.6). */
function describeError(err: unknown): { status: number; body: Omit<ErrorBody, 'correlationId'> } {
  if (err instanceof AuthenticationError) {
    return { status: 401, body: { error: 'AUTHENTICATION_ERROR', message: 'Authentication required' } };
  }
  if (err instanceof PlanGenerationError) {
    // Design: plan generation failure is a 400 that carries the validation errors.
    return {
      status: 400,
      body: {
        error: 'PLAN_GENERATION_FAILED',
        message: err.message,
        details: { attempts: err.attempts, validation_errors: err.lastErrors },
      },
    };
  }
  if (err instanceof ValidationErrorClass) {
    return { status: 400, body: { error: 'VALIDATION_ERROR', message: err.message } };
  }
  if (err instanceof TimeoutError) {
    return { status: 504, body: { error: err.code, message: err.message } };
  }
  if (typeof err === 'object' && err !== null && (err as { type?: unknown }).type === 'entity.parse.failed') {
    return { status: 400, body: { error: 'INVALID_JSON', message: 'Request body must be valid JSON' } };
  }
  if (err instanceof APIError) {
    // Upstream text can contain provider details; keep it in the logs only.
    return { status: 500, body: { error: 'PLAN_SERVICE_UNAVAILABLE', message: 'Plan generation is temporarily unavailable' } };
  }
  return { status: 500, body: { error: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' } };
}

export function createApp(deps: AppDeps): express.Express {
  const timeoutMs = deps.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const app = express();

  app.use(express.json());

  // Correlation id for every request, returned in a header and in error bodies (Requirement 17.8).
  app.use((_req, res, next) => {
    const correlationId = randomUUID();
    res.locals['correlationId'] = correlationId;
    res.setHeader('X-Correlation-Id', correlationId);
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/plans/generate', async (req, res, next) => {
    try {
      const userId = await deps.authenticate(req);

      const validation = validatePlanRequest(req.body);
      if (!validation.valid) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: validation.errors,
          correlationId: res.locals['correlationId'],
        });
        return;
      }

      const profile = await deps.loadProfile(userId);
      logger.info({ correlationId: res.locals['correlationId'], userId }, 'plan generation started');

      const plan = await withTimeout(deps.assistant.generatePlan(profile, validation.request), timeoutMs);
      const planId = await deps.storePlan(userId, plan, 'openrouter');

      logger.info({ correlationId: res.locals['correlationId'], userId, planId }, 'plan generation finished');
      res.status(201).json({ id: planId, plan });
    } catch (err) {
      next(err);
    }
  });

  // Global error handler: the only place that writes error responses.
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const correlationId = (res.locals['correlationId'] as string | undefined) ?? randomUUID();
    const { status, body } = describeError(err);

    const logContext = {
      correlationId,
      method: req.method,
      path: req.path,
      status,
      code: body.error,
      err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
    };
    if (status >= 500) {
      logger.error(logContext, 'request failed');
    } else {
      logger.warn(logContext, 'request rejected');
    }

    res.status(status).json({ ...body, correlationId } satisfies ErrorBody);
  });

  return app;
}
