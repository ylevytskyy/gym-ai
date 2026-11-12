/**
 * OpenRouter plan generator
 * Requirements: 10.1-10.10
 *
 * Calls an LLM through OpenRouter's OpenAI-compatible API, asks for JSON that
 * matches the workout plan schema, and accepts the result only if it passes
 * schema, catalog-reference and injury-safety validation.
 */

import OpenAI from 'openai';
import { getConfig } from '../config.js';
import { logger } from '../logger.js';
import { loadRepoJson } from '../repo-files.js';
import { parseWorkoutPlan, validatePlanSafety, validateWorkoutPlan } from '../validator/index.js';
import { loadCatalog } from '../tools/catalog.js';
import { buildHealthSection, redactHealth } from './health-prompt.js';
import {
  APIError,
  PlanGenerationError,
  type Assistant,
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
    const messages: ChatMessage[] = [
      { role: 'system', content: this.buildSystemPrompt(profile, request, context) },
      { role: 'user', content: this.buildUserPrompt(profile, request) },
    ];
    let lastErrors: ValidationError[] = [];

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const content = await this.callModel(messages, attempt);
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
  private async callModel(messages: ChatMessage[], attempt: number): Promise<string> {
    logger.info({ model: this.model, attempt, messageCount: messages.length }, 'openrouter request');
    logger.debug(
      { body: messages.map((m) => ({ ...m, content: redactHealth(m.content) })) },
      'openrouter request body',
    );

    let response: Awaited<ReturnType<ChatClient['chat']['completions']['create']>>;
    try {
      response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: TEMPERATURE,
        response_format: { type: 'json_object' },
      });
    } catch (err) {
      const status = (err as { status?: unknown }).status;
      const statusCode = typeof status === 'number' ? status : 500;
      const message = err instanceof Error ? err.message : 'unknown error';
      logger.error({ model: this.model, attempt, statusCode }, 'openrouter request failed');
      throw new APIError(`OpenRouter request failed: ${message}`, 'openrouter', statusCode);
    }

    const content = response.choices[0]?.message?.content ?? '';
    logger.debug({ body: content }, 'openrouter response body');
    return content;
  }
}
