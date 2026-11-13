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
import { loadCatalog } from '../tools/catalog.js';
import { validatePlanSafety } from '../validator/index.js';
import { validateAdjustRequest, validateChatRequest, validatePlanRequest } from './validation.js';
import {
  AppError,
  APIError,
  AuthenticationError,
  PlanGenerationError,
  ValidationErrorClass,
  type Assistant,
  type ChatTurn,
  type HealthSummary,
  type Profile,
  type UsageAction,
  type UsageDecision,
  type WorkoutPlan,
} from '../types.js';

const DEFAULT_TIMEOUT_MS = 30_000;
/** A whole new plan takes a model longer than a reply. The app stops waiting at 60 seconds, so this ends first. */
const DEFAULT_GENERATE_TIMEOUT_MS = 55_000;
const DEFAULT_HEALTH_TIMEOUT_MS = 3_000;

export interface AppDeps {
  assistant: Assistant;
  /** Resolves the user id from the request, or throws AuthenticationError. */
  authenticate: (req: Request) => Promise<string>;
  loadProfile: (userId: string) => Promise<Profile>;
  storePlan: (userId: string, plan: WorkoutPlan, provider: string) => Promise<string>;
  /**
   * The user's health summary, or null when they have no recent health days. Optional: without
   * it plans are generated from the profile alone.
   */
  loadHealthSummary?: (userId: string) => Promise<HealthSummary | null>;
  /** The user's newest active plan, or null when they have none. */
  loadActivePlan: (userId: string) => Promise<{ id: string; plan: WorkoutPlan } | null>;
  /** The last `limit` chat turns, oldest first. */
  loadMessages: (userId: string, limit: number) => Promise<ChatTurn[]>;
  storeMessages: (userId: string, message: string, reply: string) => Promise<void>;
  /** Adds injuries to the profile and returns the updated profile. Injuries are never removed here. */
  addInjuries: (userId: string, injuries: string[]) => Promise<Profile>;
  /** Retires the user's active plans, so the app offers to make a new one. */
  archivePlans: (userId: string) => Promise<void>;
  /** How many model requests one user may make in a stretch of time. Kept in memory, per process. */
  limits?: { max: number; windowMs: number };
  /**
   * Reserves one AI use against the user's allowance before the model is called, or refuses at
   * the limit. Throws when the allowance cannot be checked.
   */
  reserveUse: (userId: string, action: UsageAction, requestId: string) => Promise<UsageDecision>;
  /** Marks a reserved use as used (ok) or released (the request failed, so it does not count). */
  finishUse: (useId: string, ok: boolean) => Promise<void>;
  /** Deletes the user and, through the database, everything stored about them. */
  deleteAccount: (userId: string) => Promise<void>;
  /** How long the health lookup may take before the plan is generated without it. */
  healthTimeoutMs?: number;
  requestTimeoutMs?: number;
}

interface ErrorBody {
  error: string;
  message: string;
  details?: unknown;
  correlationId: string;
}

class NoActivePlanError extends AppError {
  constructor() {
    super('There is no plan to change yet', 'NO_ACTIVE_PLAN', 404);
  }
}

/** Chat turns sent to the model with each message. */
const CHAT_HISTORY_TURNS = 20;

const PLAN_NOT_CHANGED = 'I could not change your plan this time, so it stays as it was. Please try again in a moment.';
const NO_SAFE_PLAN =
  'I have added that to your profile, but I could not make a safe plan right now, so I took the old plan away. Create a new one on the Today tab. Skip any exercise that hurts, and see a professional if the pain stays.';
const NO_SAFE_PLAN_KEPT =
  'I have added that to your profile, but I could not change your plan right now. Skip any exercise that hurts, and see a professional if the pain stays.';

const DEFAULT_LIMITS = { max: 30, windowMs: 10 * 60_000 };

class TooManyRequestsError extends AppError {
  constructor() {
    super('Too many requests; wait a moment and try again', 'TOO_MANY_REQUESTS', 429);
  }
}

/**
 * Holds back a user who asks too often, and lets one model request per user run at a time:
 * every request costs model calls, and two at once could each work from an outdated profile.
 */
function createGate(limits: { max: number; windowMs: number }) {
  const recent = new Map<string, number[]>();
  const running = new Set<string>();
  return function admit(userId: string): () => void {
    const now = Date.now();
    const times = (recent.get(userId) ?? []).filter((time) => now - time < limits.windowMs);
    if (running.has(userId) || times.length >= limits.max) {
      recent.set(userId, times);
      throw new TooManyRequestsError();
    }
    times.push(now);
    recent.set(userId, times);
    running.add(userId);
    return () => void running.delete(userId);
  };
}

class UsageLimitError extends AppError {
  constructor(public readonly decision: UsageDecision) {
    super('You have used your AI allowance for now', 'USAGE_LIMIT', 429);
  }
}

class DuplicateRequestError extends AppError {
  constructor() {
    super('This request was already sent', 'DUPLICATE_REQUEST', 409);
  }
}

class UsageUnavailableError extends AppError {
  constructor() {
    super('The coach is temporarily unavailable; try again in a moment', 'USAGE_UNAVAILABLE', 503);
  }
}

/** Longest Idempotency-Key accepted; the stored request id adds the action in front of it. */
const MAX_IDEMPOTENCY_KEY = 100;
const IDEMPOTENCY_KEY = /^[\x21-\x7e]+$/;

/** What the app is told about the allowance; the use id stays on the server. */
function usageView(decision: UsageDecision) {
  return { tier: decision.tier, limit: decision.limit, remaining: decision.remaining, resetsAt: decision.resetsAt };
}

/**
 * The request id for counting: the client's Idempotency-Key, so a retry is counted once, or a
 * fresh id. Scoped to the action, so one key cannot be counted under another action.
 * Returns null for a key that is not acceptable.
 */
function requestIdFor(req: Request, action: UsageAction): string | null {
  const key = req.get('idempotency-key');
  if (key === undefined) return `${action}:${randomUUID()}`;
  if (key.length < 1 || key.length > MAX_IDEMPOTENCY_KEY || !IDEMPOTENCY_KEY.test(key)) return null;
  return `${action}:${key}`;
}

/** Reserves one use or throws: 429 at the limit, 503 when the allowance cannot be checked. */
async function reserveOrRefuse(deps: AppDeps, userId: string, action: UsageAction, requestId: string): Promise<UsageDecision & { useId: string }> {
  let decision: UsageDecision;
  try {
    decision = await deps.reserveUse(userId, action, requestId);
  } catch (err) {
    logger.error({ userId, action, err: err instanceof Error ? { name: err.name, message: err.message } : String(err) }, 'AI allowance could not be checked');
    throw new UsageUnavailableError();
  }
  if (decision.duplicate) throw new DuplicateRequestError();
  if (!decision.allowed || decision.useId === null) throw new UsageLimitError(decision);
  return { ...decision, useId: decision.useId };
}

/**
 * Finishing a use never changes the answer: a use left reserved still counts, which is the safe side.
 * A use is marked used as soon as the model has answered, and released only when no answer came
 * (the model failed or took too long), so a later failure does not make the model call free.
 */
async function finishQuietly(deps: AppDeps, useId: string, ok: boolean, correlationId: string): Promise<void> {
  try {
    await deps.finishUse(useId, ok);
  } catch (err) {
    logger.warn({ correlationId, useId, ok, err: err instanceof Error ? { name: err.name, message: err.message } : String(err) }, 'AI use not finished');
  }
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
  if (err instanceof TooManyRequestsError) {
    return { status: 429, body: { error: err.code, message: err.message } };
  }
  if (err instanceof UsageLimitError) {
    return { status: 429, body: { error: err.code, message: err.message, details: usageView(err.decision) } };
  }
  if (err instanceof DuplicateRequestError) {
    return { status: 409, body: { error: err.code, message: err.message } };
  }
  if (err instanceof UsageUnavailableError) {
    return { status: 503, body: { error: err.code, message: err.message } };
  }
  if (err instanceof NoActivePlanError) {
    return { status: 404, body: { error: err.code, message: err.message } };
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

/**
 * Health data improves a plan but is never required for one: a failed or slow lookup is logged
 * and the plan is generated without it.
 */
async function loadHealth(deps: AppDeps, userId: string, correlationId: string): Promise<HealthSummary | null> {
  if (!deps.loadHealthSummary) return null;
  try {
    return await withTimeout(deps.loadHealthSummary(userId), deps.healthTimeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS);
  } catch (err) {
    logger.warn(
      { correlationId, userId, err: err instanceof Error ? { name: err.name, message: err.message } : String(err) },
      'health summary unavailable; generating the plan without it',
    );
    return null;
  }
}

/**
 * Stores a plan only if it is safe for the profile as it is now. The model's own check ran
 * against the profile loaded when the request began; an injury may have been added since.
 */
async function storeChecked(deps: AppDeps, userId: string, plan: WorkoutPlan): Promise<string> {
  const profile = await deps.loadProfile(userId);
  const safety = validatePlanSafety(plan, profile, loadCatalog());
  if (!safety.success) {
    throw new PlanGenerationError(
      'The plan conflicts with an injury in the profile',
      1,
      safety.violations.map((v) => ({ path: v.location, message: `Exercise '${v.exercise_id}' conflicts with injury '${v.injury}'`, code: 'INJURY_CONFLICT' })),
    );
  }
  return deps.storePlan(userId, plan, 'openrouter');
}

export function createApp(deps: AppDeps): express.Express {
  const timeoutMs = deps.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const generateTimeoutMs = deps.requestTimeoutMs ?? DEFAULT_GENERATE_TIMEOUT_MS;
  const admit = createGate(deps.limits ?? DEFAULT_LIMITS);
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

  const badIdempotencyKey = (res: Response): void => {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: `Idempotency-Key must be 1 to ${MAX_IDEMPOTENCY_KEY} visible ASCII characters`,
      correlationId: res.locals['correlationId'],
    });
  };

  app.post('/api/plans/generate', async (req, res, next) => {
    let release: (() => void) | undefined;
    let use: (UsageDecision & { useId: string }) | undefined;
    let answered = false;
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

      const requestId = requestIdFor(req, 'new_plan');
      if (requestId === null) return badIdempotencyKey(res);

      release = admit(userId);
      use = await reserveOrRefuse(deps, userId, 'new_plan', requestId);
      const profile = await deps.loadProfile(userId);
      logger.info({ correlationId: res.locals['correlationId'], userId }, 'plan generation started');

      const health = await loadHealth(deps, userId, res.locals['correlationId'] as string);
      const plan = await withTimeout(deps.assistant.generatePlan(profile, validation.request, { health }), generateTimeoutMs);
      answered = true;
      await finishQuietly(deps, use.useId, true, res.locals['correlationId'] as string);
      const planId = await storeChecked(deps, userId, plan);

      logger.info({ correlationId: res.locals['correlationId'], userId, planId }, 'plan generation finished');
      res.status(201).json({ id: planId, plan, usage: usageView(use) });
    } catch (err) {
      if (use && !answered) await finishQuietly(deps, use.useId, false, res.locals['correlationId'] as string);
      next(err);
    } finally {
      release?.();
    }
  });

  const invalid = (res: Response, details: unknown): void => {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Invalid request body',
      details,
      correlationId: res.locals['correlationId'],
    });
  };

  app.post('/api/plans/adjust', async (req, res, next) => {
    let release: (() => void) | undefined;
    let use: (UsageDecision & { useId: string }) | undefined;
    let answered = false;
    try {
      const userId = await deps.authenticate(req);
      const validation = validateAdjustRequest(req.body);
      if (!validation.valid) return invalid(res, validation.errors);
      const requestId = requestIdFor(req, 'new_plan');
      if (requestId === null) return badIdempotencyKey(res);
      release = admit(userId);

      const active = await deps.loadActivePlan(userId);
      if (!active) throw new NoActivePlanError();
      use = await reserveOrRefuse(deps, userId, 'new_plan', requestId);
      const profile = await deps.loadProfile(userId);
      const health = await loadHealth(deps, userId, res.locals['correlationId'] as string);

      const plan = await withTimeout(deps.assistant.adjustPlan(profile, active.plan, validation.text, { health }), timeoutMs);
      answered = true;
      await finishQuietly(deps, use.useId, true, res.locals['correlationId'] as string);
      const planId = await storeChecked(deps, userId, plan);
      logger.info({ correlationId: res.locals['correlationId'], userId, planId }, 'plan adjusted');
      res.status(201).json({ id: planId, plan, usage: usageView(use) });
    } catch (err) {
      if (use && !answered) await finishQuietly(deps, use.useId, false, res.locals['correlationId'] as string);
      next(err);
    } finally {
      release?.();
    }
  });

  /**
   * Chat. The model can ask for two changes, and the server applies them: injuries to add to
   * the profile, and an adjustment of the plan, which is validated like a new plan. A change
   * that fails leaves things as they were and the reply says so.
   */
  app.post('/api/chat', async (req, res, next) => {
    let release: (() => void) | undefined;
    let use: (UsageDecision & { useId: string }) | undefined;
    let answered = false;
    try {
      const correlationId = res.locals['correlationId'] as string;
      const userId = await deps.authenticate(req);
      const validation = validateChatRequest(req.body);
      if (!validation.valid) return invalid(res, validation.errors);
      const message = validation.text;
      const requestId = requestIdFor(req, 'chat_message');
      if (requestId === null) return badIdempotencyKey(res);
      release = admit(userId);
      use = await reserveOrRefuse(deps, userId, 'chat_message', requestId);

      let profile = await deps.loadProfile(userId);
      const active = await deps.loadActivePlan(userId);
      const health = await loadHealth(deps, userId, correlationId);
      // Earlier turns make the answer better but are not required for one.
      const history = await deps.loadMessages(userId, CHAT_HISTORY_TURNS).catch((): ChatTurn[] => []);

      const result = await withTimeout(deps.assistant.chat({ profile, message, history, plan: active?.plan ?? null, health }), timeoutMs);
      answered = true;
      await finishQuietly(deps, use.useId, true, correlationId);
      let reply = result.reply;

      const injuriesAdded = result.addInjuries ?? [];
      if (injuriesAdded.length > 0) profile = await deps.addInjuries(userId, injuriesAdded);

      // A plan made before an injury was known has to be made again with it, asked for or not.
      const feedback =
        result.adjustPlan ?? (injuriesAdded.length > 0 ? `The user now has: ${injuriesAdded.join(', ')}. Replace every exercise that conflicts with it.` : undefined);

      let changed: { id: string; plan: WorkoutPlan } | null = null;
      let removed = false;
      if (feedback !== undefined && active) {
        const attempts: Array<() => Promise<WorkoutPlan>> = [() => deps.assistant.adjustPlan(profile, active.plan, feedback, { health })];
        if (injuriesAdded.length > 0) {
          attempts.push(() => deps.assistant.generatePlan(profile, { duration_days: active.plan.days.length, focus_areas: [] }, { health }));
        }
        // All attempts share one stretch of time, so the whole request ends well before the app stops waiting.
        const deadline = Date.now() + timeoutMs;
        for (const attempt of attempts) {
          const left = deadline - Date.now();
          // Too little time left to get a plan back: not worth a model call.
          if (left < timeoutMs / 10) break;
          try {
            const plan = await withTimeout(attempt(), left);
            changed = { id: await storeChecked(deps, userId, plan), plan };
            break;
          } catch (err) {
            logger.warn({ correlationId, userId, err: err instanceof Error ? { name: err.name, message: err.message } : String(err) }, 'plan change from chat failed');
          }
        }
        if (!changed && injuriesAdded.length > 0) {
          // The old plan was made without the injury. It is taken away rather than left to be played.
          try {
            await deps.archivePlans(userId);
            removed = true;
            reply = NO_SAFE_PLAN;
          } catch (err) {
            logger.error({ correlationId, userId, err: err instanceof Error ? { name: err.name, message: err.message } : String(err) }, 'unsafe plan could not be archived');
            reply = NO_SAFE_PLAN_KEPT;
          }
        } else if (!changed) {
          reply = PLAN_NOT_CHANGED;
        }
      }

      try {
        await deps.storeMessages(userId, message, reply);
      } catch (err) {
        logger.warn({ correlationId, userId, err: err instanceof Error ? { name: err.name, message: err.message } : String(err) }, 'chat turn not stored');
      }

      logger.info({ correlationId, userId, planChanged: changed !== null, planRemoved: removed, injuriesAdded: injuriesAdded.length }, 'chat answered');
      res.json({ reply, plan: changed, plan_removed: removed, injuries_added: injuriesAdded, usage: usageView(use) });
    } catch (err) {
      if (use && !answered) await finishQuietly(deps, use.useId, false, res.locals['correlationId'] as string);
      next(err);
    } finally {
      release?.();
    }
  });

  app.delete('/api/account', async (req, res, next) => {
    try {
      const userId = await deps.authenticate(req);
      await deps.deleteAccount(userId);
      logger.info({ correlationId: res.locals['correlationId'], userId }, 'account deleted');
      res.status(204).end();
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
