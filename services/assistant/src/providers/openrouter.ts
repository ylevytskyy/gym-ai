/**
 * OpenRouter plan generator
 * Requirements: 10.1-10.10
 *
 * Calls an LLM through OpenRouter's OpenAI-compatible API, asks for JSON that
 * matches the workout plan schema, and accepts the result only if it passes
 * schema, catalog-reference and injury-safety validation.
 */

import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import { getConfig } from '../config.js';
import { logger } from '../logger.js';
import { loadRepoJson } from '../repo-files.js';
import { parseWorkoutPlan, validatePlanSafety, validateWorkoutPlan } from '../validator/index.js';
import { loadCatalog } from '../tools/catalog.js';
import { buildChatSystemPrompt, parseChatOutput } from './chat-prompt.js';
import { buildHealthSection, redactHealth } from './health-prompt.js';
import {
  APIError,
  PlanGenerationError,
  type Assistant,
  type ChatInput,
  type ChatResult,
  type Exercise,
  type PlanContext,
  type PlanRequest,
  type Profile,
  type ValidationError,
  type WorkoutPlan,
} from '../types.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const MAX_ATTEMPTS = 2;
const TEMPERATURE = 0.7;
/**
 * Output caps in tokens. Reasoning tokens count against them on most providers. Measured
 * 2026-11-13 (docs/monetization.md): plans used up to 4600 tokens, coach replies up to 1200.
 */
const PLAN_MAX_TOKENS = 12000;
const CHAT_MAX_TOKENS = 4000;
/**
 * OpenRouter routing: only providers that neither store nor train on prompts, and only
 * zero-data-retention endpoints. Chats and plans carry health data. If no provider qualifies,
 * OpenRouter returns an error instead of falling back. https://openrouter.ai/docs/features/zdr
 */
const PROVIDER_PREFERENCES = { data_collection: 'deny', zdr: true } as const;

/** The part of the OpenAI client this class uses. Tests pass a fake. */
export type ChatClient = Pick<OpenAI, 'chat'>;

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export interface OpenRouterAssistantOptions {
  client?: ChatClient;
  apiKey?: string;
  model?: string;
  catalog?: Exercise[];
}

export class OpenRouterAssistant implements Assistant {
  private readonly client: ChatClient;
  private readonly model: string;
  private readonly catalog: Exercise[];
  private readonly schemaJson: string;

  constructor(options: OpenRouterAssistantOptions = {}) {
    if (options.client) {
      this.client = options.client;
    } else {
      const apiKey = options.apiKey ?? getConfig().openrouterApiKey;
      this.client = new OpenAI({ apiKey, baseURL: OPENROUTER_BASE_URL });
    }
    this.model = options.model ?? getConfig().openrouterModel;
    this.catalog = options.catalog ?? loadCatalog();
    this.schemaJson = JSON.stringify(
      loadRepoJson('schemas/workout-plan.schema.json'),
      null,
      2,
    );
  }

  /**
   * Generate a plan for the profile. One retry carries the validation errors
   * back to the model; if the retry also fails, throws PlanGenerationError.
   * Requirements 10.6-10.9.
   */
  async generatePlan(profile: Profile, request: PlanRequest, context: PlanContext = {}): Promise<WorkoutPlan> {
    return this.planFrom(profile, [
      { role: 'system', content: this.buildSystemPrompt(profile, request, context) },
      { role: 'user', content: this.buildUserPrompt(profile, request) },
    ]);
  }

  /**
   * Change an existing plan as the feedback asks. The result goes through the same checks and
   * the same single retry as a new plan, and comes back as a new plan (new id and date).
   */
  async adjustPlan(profile: Profile, plan: WorkoutPlan, feedback: string, context: PlanContext = {}): Promise<WorkoutPlan> {
    const request: PlanRequest = { duration_days: plan.days.length, focus_areas: [] };
    const system = [
      this.buildSystemPrompt(profile, request, context),
      '',
      '## Current plan',
      'Change this plan as the user asks. Keep what they did not ask to change, and keep the number of days.',
      JSON.stringify(plan),
    ].join('\n');
    // The feedback can repeat what the user wrote about their health, so bodies are not logged.
    const adjusted = await this.planFrom(
      profile,
      [
        { role: 'system', content: system },
        { role: 'user', content: `Change the plan like this: ${feedback}` },
      ],
      false,
    );
    return { ...adjusted, id: randomUUID(), created_at: new Date().toISOString() };
  }

  /** One reply in a conversation. Message bodies are never logged: users write about their health here. */
  async chat(input: ChatInput): Promise<ChatResult> {
    const messages: ChatMessage[] = [
      { role: 'system', content: buildChatSystemPrompt(input.profile, input.plan, input.health) },
      ...input.history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: 'user', content: input.message },
    ];
    const content = await this.callModel(messages, 1, CHAT_MAX_TOKENS, false);
    return parseChatOutput(content, input.profile.injuries);
  }

  /** Ask for a plan and accept it only when it passes every check; one retry carries the errors back. */
  private async planFrom(profile: Profile, messages: ChatMessage[], logBodies = true): Promise<WorkoutPlan> {
    let lastErrors: ValidationError[] = [];

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const content = await this.callModel(messages, attempt, PLAN_MAX_TOKENS, logBodies);
      const { plan, errors } = this.checkCandidate(content, profile);

      if (plan && errors.length === 0) {
        logger.info({ model: this.model, attempt }, 'plan generated');
        return plan;
      }

      lastErrors = errors;
      logger.warn({ model: this.model, attempt, errorCodes: errors.map((e) => e.code) }, 'plan attempt failed validation');

      if (attempt < MAX_ATTEMPTS) {
        messages.push({ role: 'assistant', content });
        messages.push({ role: 'user', content: this.buildRetryPrompt(errors) });
      }
    }

    throw new PlanGenerationError(
      `Plan generation failed after ${MAX_ATTEMPTS} attempts`,
      MAX_ATTEMPTS,
      lastErrors,
    );
  }

  /** Requirement 10.5: system prompt with catalog, profile, health data, safety rules and schema. */
  private buildSystemPrompt(profile: Profile, _request: PlanRequest, context: PlanContext): string {
    const injuries = profile.injuries.length > 0 ? profile.injuries.join(', ') : 'none';
    return [
      'You are a workout planner for the Aura Fit app. Create a workout plan for the user below.',
      '',
      '## Exercise catalog',
      'Each entry gives its id, group, difficulty level and avoid_if (injuries it conflicts with).',
      JSON.stringify(this.catalog, null, 2),
      '',
      '## User profile',
      `- Fitness level: ${profile.fitness_level} (1=beginner, 2=intermediate, 3=advanced)`,
      `- Goal: ${profile.goal}`,
      `- Minutes per day: ${profile.minutes_per_day} (or fewer)`,
      `- Injuries: ${injuries}`,
      `- Age range: ${profile.age_range}`,
      '',
      ...buildHealthSection(context.health),
      '',
      '## Safety rules (critical)',
      '1. Never include exercises whose avoid_if matches one of the user\'s injuries.',
      '2. Only use catalog ids exactly as written in the catalog.',
      '3. Respect the fitness level: only use exercises with level at or below the user\'s fitness level.',
      '4. Keep each day within the minutes per day.',
      '',
      '## Output format',
      'Return only valid JSON matching this schema. No markdown, no commentary.',
      this.schemaJson,
    ].join('\n');
  }

  /** Requirement 10.5: per-request details (duration, focus, custom instructions). */
  private buildUserPrompt(_profile: Profile, request: PlanRequest): string {
    const lines = [
      `Create a plan for ${request.duration_days} day(s).`,
      request.focus_areas.length > 0
        ? `Focus areas: ${request.focus_areas.join(', ')}.`
        : 'Focus areas: none specified.',
    ];
    if (request.custom_instructions) {
      lines.push(`Custom instructions: ${request.custom_instructions}`);
    }
    return lines.join('\n');
  }

  private buildRetryPrompt(errors: ValidationError[]): string {
    const details = errors.map((e) => `- [${e.code}] ${e.path || '(root)'}: ${e.message}`).join('\n');
    return [
      'Your previous plan failed validation with these errors:',
      details,
      'Return the complete corrected plan as JSON only, with no commentary.',
    ].join('\n');
  }

  /** Parse, then validate schema + references, then injury safety. */
  private checkCandidate(
    content: string,
    profile: Profile,
  ): { plan?: WorkoutPlan; errors: ValidationError[] } {
    const parsed = parseWorkoutPlan(content);
    if (!parsed.success || parsed.data === undefined) {
      return { errors: [{ path: '', message: parsed.error ?? 'Output was not JSON', code: 'INVALID_JSON' }] };
    }

    const plan = parsed.data;
    const validation = validateWorkoutPlan(plan, this.catalog);
    if (!validation.success) {
      return { errors: validation.errors };
    }

    const safety = validatePlanSafety(plan, profile, this.catalog);
    if (!safety.success) {
      return {
        errors: safety.violations.map((v) => ({
          path: v.location,
          message: `Exercise '${v.exercise_id}' conflicts with injury '${v.injury}'`,
          code: 'INJURY_CONFLICT',
        })),
      };
    }

    return { plan, errors: [] };
  }

  /** One chat completion. Requirement 10.10: metadata at info, bodies at debug. */
  private async callModel(messages: ChatMessage[], attempt: number, maxTokens: number, logBodies = true): Promise<string> {
    logger.info({ model: this.model, attempt, messageCount: messages.length }, 'openrouter request');
    if (logBodies) {
      logger.debug(
        { body: messages.map((m) => ({ ...m, content: redactHealth(m.content) })) },
        'openrouter request body',
      );
    }

    let response: Awaited<ReturnType<ChatClient['chat']['completions']['create']>>;
    try {
      // `provider` is an OpenRouter field the OpenAI types do not know; the body is built first so
      // TypeScript accepts the extra field.
      const body = {
        model: this.model,
        messages,
        temperature: TEMPERATURE,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' as const },
        provider: PROVIDER_PREFERENCES,
      };
      response = await this.client.chat.completions.create(body);
    } catch (err) {
      const status = (err as { status?: unknown }).status;
      const statusCode = typeof status === 'number' ? status : 500;
      const message = err instanceof Error ? err.message : 'unknown error';
      logger.error({ model: this.model, attempt, statusCode }, 'openrouter request failed');
      throw new APIError(`OpenRouter request failed: ${message}`, 'openrouter', statusCode);
    }

    const content = response.choices[0]?.message?.content ?? '';
    if (response.choices[0]?.finish_reason === 'length') {
      // The answer was cut off and will fail to parse; this tells that apart from a bad answer.
      logger.warn(
        { model: this.model, attempt, maxTokens, completionTokens: response.usage?.completion_tokens },
        'openrouter reply hit the token cap',
      );
    }
    if (logBodies) logger.debug({ body: content }, 'openrouter response body');
    return content;
  }
}
