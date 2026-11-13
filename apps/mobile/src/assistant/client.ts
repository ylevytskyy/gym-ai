/** Calls to the assistant service other than plan generation: chat and account deletion. */

import { isWorkoutPlan, type StoredPlan } from '@/plan/model';

import { parseUsage, type Usage } from './usage';

/** An error whose message is fit to show to the user. `usage` is set when the AI allowance is used up. */
export class AssistantError extends Error {
  constructor(
    message: string,
    readonly usage?: Usage,
  ) {
    super(message);
  }
}

const CHAT_TIMEOUT_MS = 90_000;
const ACCOUNT_TIMEOUT_MS = 30_000;

export interface ChatAnswer {
  reply: string;
  /** The new plan when the conversation changed it, otherwise null. */
  plan: StoredPlan | null;
  /** True when the old plan was taken away because it no longer suits the profile and no new one could be made. */
  planRemoved: boolean;
  injuriesAdded: string[];
  /** The allowance after this message, or null when the service did not say. */
  usage: Usage | null;
}

interface Call {
  method: 'POST' | 'DELETE';
  path: string;
  body?: unknown;
  /** Counts a user action once on the server, however often it is sent. */
  idempotencyKey?: string;
  timeoutMs: number;
  tooSlow: string;
  unreachable: string;
}

/** One request with a time limit that also covers reading the body. Resolves to the status and the parsed body. */
async function call(fetchFn: typeof fetch, assistantUrl: string, accessToken: string, request: Call): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);
  try {
    const response = await fetchFn(`${assistantUrl}${request.path}`, {
      method: request.method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
        ...(request.idempotencyKey === undefined ? {} : { 'idempotency-key': request.idempotencyKey }),
      },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      signal: controller.signal,
    });
    const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
    if (controller.signal.aborted) throw new AssistantError(request.tooSlow);
    return { status: response.status, body };
  } catch (error) {
    if (error instanceof AssistantError) throw error;
    throw new AssistantError(controller.signal.aborted ? request.tooSlow : request.unreachable);
  } finally {
    clearTimeout(timer);
  }
}

const EXPIRED = 'Your session has expired. Sign in again.';

/** The `error` code of a failed response, when there is one. */
export function errorCode(body: unknown): string | undefined {
  const code = (body as { error?: unknown } | null)?.error;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Sends one chat message. The service stores the exchange and applies any plan change itself.
 * `idempotencyKey` is new for each message the user sends and the same when that message is sent again.
 */
export async function sendChat(
  fetchFn: typeof fetch,
  assistantUrl: string,
  accessToken: string,
  message: string,
  idempotencyKey: string,
  timeoutMs = CHAT_TIMEOUT_MS,
): Promise<ChatAnswer> {
  const { status, body } = await call(fetchFn, assistantUrl, accessToken, {
    method: 'POST',
    path: '/api/chat',
    body: { message },
    idempotencyKey,
    timeoutMs,
    tooSlow: 'The assistant took too long. Try again.',
    unreachable: 'Could not reach the assistant. Check your connection and try again.',
  });
  // Server text can carry details that mean nothing to the user; only the status decides the message.
  if (status === 401) throw new AssistantError(EXPIRED);
  if (status === 400) throw new AssistantError('That message could not be sent. Try a shorter one.');
  const code = errorCode(body);
  if (status === 429 && code === 'USAGE_LIMIT') {
    throw new AssistantError('You have used your coach messages for now.', parseUsage((body as { details?: unknown }).details) ?? undefined);
  }
  if (status === 429) throw new AssistantError('The coach is still busy with your last message, or you have sent a lot. Wait a moment and try again.');
  if (status === 409) throw new AssistantError('That message was already sent. Open the Coach tab again to see the answer.');
  if (status === 503) throw new AssistantError('The coach is not available right now. Try again in a few minutes.');
  if (status < 200 || status >= 300) throw new AssistantError('The assistant is not available right now. Try again later.');

  const answer = body as { reply?: unknown; plan?: { id?: unknown; plan?: unknown } | null; plan_removed?: unknown; injuries_added?: unknown; usage?: unknown } | null;
  if (!answer || typeof answer.reply !== 'string' || answer.reply === '') throw new AssistantError('The answer could not be read. Try again.');
  const plan = answer.plan && typeof answer.plan.id === 'string' && isWorkoutPlan(answer.plan.plan) ? { id: answer.plan.id, plan: answer.plan.plan } : null;
  const injuriesAdded = Array.isArray(answer.injuries_added) ? answer.injuries_added.filter((injury): injury is string => typeof injury === 'string') : [];
  // A plan that came back but cannot be read still means the plan changed: the caller loads it again.
  const planUnreadable = answer.plan !== null && answer.plan !== undefined && plan === null;
  return { reply: answer.reply, plan, planRemoved: answer.plan_removed === true || planUnreadable, injuriesAdded, usage: parseUsage(answer.usage) };
}

/** Asks the service to delete the signed-in user and everything stored about them. */
export async function deleteAccount(fetchFn: typeof fetch, assistantUrl: string, accessToken: string, timeoutMs = ACCOUNT_TIMEOUT_MS): Promise<void> {
  const failed = 'Your account could not be deleted right now. Try again later.';
  const { status } = await call(fetchFn, assistantUrl, accessToken, {
    method: 'DELETE',
    path: '/api/account',
    timeoutMs,
    tooSlow: failed,
    unreachable: 'Could not reach the service. Check your connection and try again.',
  });
  if (status === 401) throw new AssistantError(EXPIRED);
  if (status < 200 || status >= 300) throw new AssistantError(failed);
}
