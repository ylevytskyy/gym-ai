/**
 * OpenRouter assistant tests (chat client is faked; no network calls).
 * Requirements: 10.1-10.10
 */

import { describe, it, expect, vi } from 'vitest';
import { OpenRouterAssistant, type ChatClient } from '../src/providers/openrouter';
import { redactHealth } from '../src/providers/health-prompt';
import { PlanGenerationError, APIError } from '../src/types';
import type { HealthSummary, PlanRequest, Profile, WorkoutPlan } from '../src/types';

const beginner: Profile = {
  id: 'user-1',
  age_range: '25-34',
  weight_kg: 70,
  goal: 'move_more',
  fitness_level: 1,
  injuries: [],
  minutes_per_day: 15,
  language: 'en',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const kneeInjured: Profile = { ...beginner, injuries: ['knee_injury'] };

const request: PlanRequest = {
  duration_days: 3,
  focus_areas: ['core'],
  custom_instructions: 'Keep it quiet, I work in an office.',
};

const plan = (exerciseId = 'plank'): WorkoutPlan => ({
  schema_version: '1.0.0',
  id: '6f1c2c1e-6a1e-4b8a-9d55-2f6e1f0a7b11',
  created_at: '2026-01-10T09:00:00Z',
  goal: 'move_more',
  notes: 'test plan',
  days: [
    {
      day: 1,
      title: 'Core',
      minutes: 10,
      blocks: [{ type: 'main', items: [{ exercise_id: exerciseId, sets: 2, amount: 30 }] }],
    },
  ],
});

/** Build a fake OpenAI-compatible client that returns the given contents in order. */
function fakeChat(...responses: Array<string | Error>) {
  const create = vi.fn(async () => {
    const next = responses.shift();
    if (next === undefined) throw new Error('no more fake responses');
    if (next instanceof Error) throw next;
    return { choices: [{ message: { content: next } }] };
  });
  const client = { chat: { completions: { create } } } as unknown as ChatClient;
  return { client, create };
}

const assistantWith = (client: ChatClient) =>
  new OpenRouterAssistant({ client, model: 'test/model', apiKey: 'test-key' });

describe('OpenRouterAssistant.generatePlan', () => {
  it('returns the plan on the first attempt and requests a JSON object response', async () => {
    const { client, create } = fakeChat(JSON.stringify(plan()));

    const result = await assistantWith(client).generatePlan(beginner, request);

    expect(result).toEqual(plan());
    expect(create).toHaveBeenCalledTimes(1);
    const args = create.mock.calls[0]![0] as any;
    expect(args.model).toBe('test/model');
    expect(args.temperature).toBe(0.7);
    expect(args.response_format).toEqual({ type: 'json_object' });
    expect(args.messages.map((m: any) => m.role)).toEqual(['system', 'user']);
  });

  it('retries once with the validation errors in the prompt when the first plan is invalid', async () => {
    const broken = { ...plan(), days: [] };
    const { client, create } = fakeChat(JSON.stringify(broken), JSON.stringify(plan()));

    const result = await assistantWith(client).generatePlan(beginner, request);

    expect(result).toEqual(plan());
    expect(create).toHaveBeenCalledTimes(2);
    const retryMessages = (create.mock.calls[1]![0] as any).messages as Array<{ role: string; content: string }>;
    expect(retryMessages.some((m) => m.role === 'user' && /validation|error/i.test(m.content))).toBe(true);
  });

  it('retries when the first plan is unsafe for the user injuries', async () => {
    // squat has avoid_if knee_injury
    const { client, create } = fakeChat(
      JSON.stringify(plan('squat')),
      JSON.stringify(plan('glute-bridge')),
    );

    const result = await assistantWith(client).generatePlan(kneeInjured, request);

    expect(result.days[0]!.blocks[0]!.items[0]!.exercise_id).toBe('glute-bridge');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('treats non-JSON output as a failed attempt', async () => {
    const { client, create } = fakeChat('Sure! Here is your plan: ...', JSON.stringify(plan()));

    const result = await assistantWith(client).generatePlan(beginner, request);

    expect(result).toEqual(plan());
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('throws PlanGenerationError with both attempts when the retry also fails', async () => {
    const { client, create } = fakeChat(
      JSON.stringify(plan('squat')),
      JSON.stringify(plan('squat')),
    );

    const error = await assistantWith(client)
      .generatePlan(kneeInjured, request)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PlanGenerationError);
    const gen = error as PlanGenerationError;
    expect(gen.attempts).toBe(2);
    expect(gen.lastErrors.length).toBeGreaterThan(0);
    expect(gen.lastErrors[0]).toMatchObject({ code: 'INJURY_CONFLICT' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('wraps provider failures in APIError without retrying', async () => {
    const { client, create } = fakeChat(Object.assign(new Error('rate limited'), { status: 429 }));

    const error = await assistantWith(client)
      .generatePlan(beginner, request)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(APIError);
    expect((error as APIError).statusCode).toBe(429);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('prompt construction (Requirements 10.5, 10.6)', () => {
  it('system prompt carries the catalog, profile, safety rules, schema and JSON-only instruction', async () => {
    const { client, create } = fakeChat(JSON.stringify(plan()));
    await assistantWith(client).generatePlan(kneeInjured, request);

    const system = (create.mock.calls[0]![0] as any).messages[0].content as string;
    expect(system).toContain('"neck-rolls"');
    expect(system).toContain('knee_injury');
    expect(system).toMatch(/fitness level/i);
    expect(system).toMatch(/never include exercises/i);
    expect(system).toMatch(/only use catalog ids/i);
    expect(system).toContain('"schema_version"');
    expect(system).toMatch(/only valid json/i);
  });

  it('user prompt carries duration, focus areas and custom instructions', async () => {
    const { client, create } = fakeChat(JSON.stringify(plan()));
    await assistantWith(client).generatePlan(beginner, request);

    const user = (create.mock.calls[0]![0] as any).messages[1].content as string;
    expect(user).toContain('3');
    expect(user).toContain('core');
    expect(user).toContain('Keep it quiet, I work in an office.');
  });

  it('omits custom instructions when none are given', async () => {
    const { client, create } = fakeChat(JSON.stringify(plan()));
    await assistantWith(client).generatePlan(beginner, { duration_days: 2, focus_areas: [] });

    const user = (create.mock.calls[0]![0] as any).messages[1].content as string;
    expect(user).not.toMatch(/custom instructions/i);
  });
});

describe('OpenRouterAssistant.generatePlan with health data', () => {
  const systemPromptOf = (create: ReturnType<typeof fakeChat>['create']): string => {
    const call = create.mock.calls[0] as unknown as [{ messages: Array<{ role: string; content: string }> }];
    return call[0].messages.find((m) => m.role === 'system')!.content;
  };

  const summary: HealthSummary = {
    days_with_data: 12,
    avg_steps: 6400,
    avg_sleep_minutes: 431,
    avg_resting_hr_bpm: 58,
    last_night_sleep_minutes: 305,
    yesterday_steps: 2100,
    readiness: { level: 'low', reasons: ['short_sleep', 'sleep_below_baseline'] },
    external_workouts_7d: { count: 2, minutes: 95, types: ['cycling', 'running'] },
    external_workout_minutes_today: 0,
  };

  it('puts the health summary into the system prompt', async () => {
    const { client, create } = fakeChat(JSON.stringify(plan()));

    await assistantWith(client).generatePlan(beginner, request, { health: summary });

    const prompt = systemPromptOf(create);
    expect(prompt).toContain('## Health data');
    expect(prompt).toContain('Days with data (today and the 14 days before): 12');
    expect(prompt).toContain('Average steps per day: 6400');
    expect(prompt).toContain('Average sleep: 7 h 11 min');
    expect(prompt).toContain('Average resting heart rate: 58 bpm');
    expect(prompt).toContain('Last night: 5 h 5 min');
    expect(prompt).toContain('Steps yesterday: 2100');
    expect(prompt).toContain('Readiness today: low (short sleep, sleep below baseline)');
    expect(prompt).toContain('Workouts recorded by other apps in the last 7 days: 2 (95 min; cycling, running)');
  });

  it('leaves out measurements the summary does not have, without zeros standing in', async () => {
    const { client, create } = fakeChat(JSON.stringify(plan()));
    const sparse: HealthSummary = {
      days_with_data: 3,
      avg_steps: 4000,
      readiness: { level: 'unknown', reasons: ['not_enough_data'] },
      external_workouts_7d: { count: 0, minutes: 0, types: [] },
      external_workout_minutes_today: 0,
    };

    await assistantWith(client).generatePlan(beginner, request, { health: sparse });

    const section = systemPromptOf(create).split('## Health data')[1]!.split('\n## ')[0]!;
    expect(section).toContain('Average steps per day: 4000');
    expect(section).not.toMatch(/sleep|heart rate|weight/i);
    expect(section).toContain('Readiness today: unknown (not enough data)');
    expect(section).toContain('Workouts recorded by other apps in the last 7 days: none');
  });

  it.each([
    ['no context', undefined],
    ['a null summary', { health: null }],
  ])('says no health data is available with %s, and still returns the plan', async (_label, context) => {
    const { client, create } = fakeChat(JSON.stringify(plan()));

    const result = await assistantWith(client).generatePlan(beginner, request, context);

    expect(result).toEqual(plan());
    const prompt = systemPromptOf(create);
    expect(prompt).toContain('## Health data');
    expect(prompt).toContain('No health data is available for this user.');
    expect(prompt).not.toContain('Average steps');
  });

  it('tells the model health data never overrides the safety rules', async () => {
    const { client, create } = fakeChat(JSON.stringify(plan()));
    await assistantWith(client).generatePlan(beginner, request, { health: summary });
    expect(systemPromptOf(create)).toMatch(/never.*(override|relax).*safety rules/i);
  });
});

describe('redactHealth', () => {
  it('removes the health section from text that is about to be logged, and nothing else', () => {
    const text = ['## User profile', '- Goal: move_more', '', '## Health data', '- Average steps per day: 6400', '- Last night: 5 h 5 min', '', '## Safety rules (critical)', '1. rule'].join('\n');
    const redacted = redactHealth(text);
    expect(redacted).not.toContain('6400');
    expect(redacted).not.toContain('5 h 5 min');
    expect(redacted).toContain('## Health data\n[redacted]');
    expect(redacted).toContain('- Goal: move_more');
    expect(redacted).toContain('## Safety rules (critical)\n1. rule');
  });

  it('leaves text without a health section unchanged', () => {
    expect(redactHealth('Create a plan for 3 day(s).')).toBe('Create a plan for 3 day(s).');
  });
});
