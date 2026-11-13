/**
 * Adjusting a plan and chatting, with a faked chat client (no network calls).
 */

import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.LOG_LEVEL = 'silent';
});

import { OpenRouterAssistant, type ChatClient } from '../src/providers/openrouter';
import { parseChatOutput, KNOWN_INJURIES, MAX_REPLY_LENGTH } from '../src/providers/chat-prompt';
import { logger } from '../src/logger';
import { PlanGenerationError } from '../src/types';
import type { HealthSummary, Profile, WorkoutPlan } from '../src/types';

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

const plan = (exerciseId = 'plank'): WorkoutPlan => ({
  schema_version: '1.0.0',
  id: '6f1c2c1e-6a1e-4b8a-9d55-2f6e1f0a7b11',
  created_at: '2026-01-10T09:00:00Z',
  goal: 'move_more',
  notes: 'test plan',
  days: [{ day: 1, title: 'Core', minutes: 10, blocks: [{ type: 'main', items: [{ exercise_id: exerciseId, sets: 2, amount: 30 }] }] }],
});

const health: HealthSummary = {
  days_with_data: 12,
  avg_steps: 4321,
  avg_sleep_minutes: 415,
  readiness: { level: 'low', reasons: ['short_sleep'] },
  external_workouts_7d: { count: 0, minutes: 0, types: [] },
  external_workout_minutes_today: 0,
} as HealthSummary;

function fakeChat(...responses: Array<string | Error>) {
  const create = vi.fn(async (_request: { messages: { role: string; content: string }[]; response_format?: unknown }) => {
    const next = responses.shift();
    if (next === undefined) throw new Error('no more fake responses');
    if (next instanceof Error) throw next;
    return { choices: [{ message: { content: next } }] };
  });
  const client = { chat: { completions: { create } } } as unknown as ChatClient;
  return { client, create };
}
const assistantWith = (client: ChatClient) => new OpenRouterAssistant({ client, model: 'test/model', apiKey: 'test-key' });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('OpenRouterAssistant.adjustPlan', () => {
  it('returns the adjusted plan as a new plan, with the current plan and the feedback in the prompt', async () => {
    const { client, create } = fakeChat(JSON.stringify(plan('side-plank')));
    const result = await assistantWith(client).adjustPlan(beginner, plan(), 'Make it easier');

    expect(result.days[0]?.blocks[0]?.items[0]?.exercise_id).toBe('side-plank');
    expect(result.id).toMatch(UUID);
    expect(result.id).not.toBe(plan().id);
    const [system, user] = create.mock.calls[0]![0].messages;
    expect(system!.content).toContain('## Current plan');
    expect(system!.content).toContain('"exercise_id":"plank"');
    expect(user!.content).toContain('Make it easier');
  });

  it('rejects an adjusted plan that conflicts with an injury, retries once with the errors, then gives up', async () => {
    const { client, create } = fakeChat(JSON.stringify(plan('squat')), JSON.stringify(plan('squat')));
    await expect(assistantWith(client).adjustPlan(kneeInjured, plan(), 'More legs')).rejects.toBeInstanceOf(PlanGenerationError);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]![0].messages.at(-1)!.content).toContain('INJURY_CONFLICT');
    for (const [body] of create.mock.calls as unknown as Array<[{ max_tokens?: number; provider?: unknown }]>) {
      expect(body.max_tokens).toBe(12000);
      expect(body.provider).toEqual({ data_collection: 'deny', zdr: true });
    }
  });

  it('accepts the corrected plan from the retry', async () => {
    const { client } = fakeChat('not json', JSON.stringify(plan('plank')));
    const result = await assistantWith(client).adjustPlan(kneeInjured, plan(), 'More legs');
    expect(result.days[0]?.blocks[0]?.items[0]?.exercise_id).toBe('plank');
  });

  it('puts the health summary in the prompt, or says there is none', async () => {
    const withHealth = fakeChat(JSON.stringify(plan()));
    await assistantWith(withHealth.client).adjustPlan(beginner, plan(), 'x', { health });
    expect(withHealth.create.mock.calls[0]![0].messages[0]!.content).toContain('Average steps per day: 4321');
    const without = fakeChat(JSON.stringify(plan()));
    await assistantWith(without.client).adjustPlan(beginner, plan(), 'x');
    expect(without.create.mock.calls[0]![0].messages[0]!.content).toContain('No health data is available');
  });
});

describe('OpenRouterAssistant.chat', () => {
  const input = { profile: beginner, message: 'My knee hurts when I squat', history: [], plan: plan('squat'), health };

  it('returns the reply with the plan change and the injuries the model asked for', async () => {
    const { client, create } = fakeChat(
      JSON.stringify({ reply: 'Sorry to hear that. I will take squats out.', adjust_plan: 'Replace squats with knee-friendly moves', add_injuries: ['knee_injury'] }),
    );
    const result = await assistantWith(client).chat(input);

    expect(result).toEqual({ reply: 'Sorry to hear that. I will take squats out.', adjustPlan: 'Replace squats with knee-friendly moves', addInjuries: ['knee_injury'] });
    expect(create.mock.calls[0]![0].response_format).toEqual({ type: 'json_object' });
  });

  it('sends the rules, the profile, the plan, the health summary and the earlier turns', async () => {
    const { client, create } = fakeChat(JSON.stringify({ reply: 'ok' }));
    await assistantWith(client).chat({
      ...input,
      history: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
      ],
    });
    const messages = create.mock.calls[0]![0].messages;
    const system = messages[0]!.content;
    expect(system).toContain('not a doctor');
    expect(system).toContain('Fitness level: 1');
    expect(system).toContain('squat');
    expect(system).toContain('Average steps per day: 4321');
    expect(messages.slice(1).map((m) => [m.role, m.content])).toEqual([
      ['user', 'hello'],
      ['assistant', 'hi there'],
      ['user', 'My knee hurts when I squat'],
    ]);
  });

  it('says so in the prompt when there is no plan and no health data', async () => {
    const { client, create } = fakeChat(JSON.stringify({ reply: 'ok' }));
    await assistantWith(client).chat({ profile: beginner, message: 'hi', history: [], plan: null });
    const system = create.mock.calls[0]![0].messages[0]!.content;
    expect(system).toContain('The user has no plan yet');
    expect(system).toContain('No health data is available');
  });

  it('answers with an apology, never an error, when the model returns something else', async () => {
    for (const bad of ['not json', '[]', '{"reply": 5}', '{"reply": "   "}', '']) {
      const { client } = fakeChat(bad);
      const result = await assistantWith(client).chat(input);
      expect(result.reply).toMatch(/could not answer/i);
      expect(result.adjustPlan).toBeUndefined();
      expect(result.addInjuries).toBeUndefined();
    }
  });

  it('caps a coach reply at 4000 tokens, reasoning included', async () => {
    const { client, create } = fakeChat(JSON.stringify({ reply: 'Rest today.', adjust_plan: null, add_injuries: [] }));
    await assistantWith(client).chat(input);
    expect((create.mock.calls[0]![0] as { max_tokens?: number }).max_tokens).toBe(4000);
  });
});

describe('parseChatOutput', () => {
  it('keeps only known injuries the profile does not have yet', () => {
    const result = parseChatOutput(JSON.stringify({ reply: 'ok', add_injuries: ['knee_injury', 'made_up', 7, 'neck_injury', 'knee_injury'] }), ['neck_injury']);
    expect(result.addInjuries).toEqual(['knee_injury']);
    expect(KNOWN_INJURIES).toContain('knee_injury');
  });

  it('drops an empty or non-text plan change and an empty injury list', () => {
    expect(parseChatOutput(JSON.stringify({ reply: 'ok', adjust_plan: '  ', add_injuries: [] }), [])).toEqual({ reply: 'ok' });
    expect(parseChatOutput(JSON.stringify({ reply: 'ok', adjust_plan: { do: 'x' }, add_injuries: 'knee_injury' }), [])).toEqual({ reply: 'ok' });
  });

  it('caps the length of the reply and of the plan change', () => {
    const result = parseChatOutput(JSON.stringify({ reply: 'a'.repeat(9000), adjust_plan: 'b'.repeat(9000) }), []);
    expect(result.reply.length).toBe(MAX_REPLY_LENGTH);
    expect(result.adjustPlan?.length).toBe(500);
  });
});

describe('logging', () => {
  it('never logs what the user wrote, in chat or when the plan is adjusted from it', async () => {
    const logged: unknown[] = [];
    const spies = (['debug', 'info', 'warn', 'error'] as const).map((level) =>
      vi.spyOn(logger, level).mockImplementation(((...args: unknown[]) => void logged.push(args)) as never),
    );
    const chat = fakeChat(JSON.stringify({ reply: 'Reply about the sore knee', adjust_plan: 'no squats' }));
    await assistantWith(chat.client).chat({ profile: beginner, message: 'My knee is sore since Tuesday', history: [{ role: 'user', content: 'earlier words' }], plan: plan(), health });
    const adjust = fakeChat(JSON.stringify(plan()));
    await assistantWith(adjust.client).adjustPlan(beginner, plan(), 'The user has a sore knee since Tuesday', { health });
    spies.forEach((spy) => spy.mockRestore());

    const text = JSON.stringify(logged);
    for (const secret of ['sore', 'Tuesday', 'earlier words', '4321']) expect(text).not.toContain(secret);
    expect(logged.length).toBeGreaterThan(0);
  });

  it('warns, without the text, when the token cap cuts a reply off', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation((() => undefined) as never);
    const create = vi.fn(async () => ({
      choices: [{ message: { content: '{"reply": "Stretch your sore' }, finish_reason: 'length' }],
      usage: { completion_tokens: 4000 },
    }));
    const client = { chat: { completions: { create } } } as unknown as ChatClient;

    const result = await assistantWith(client).chat({ profile: beginner, message: 'Hi', history: [], plan: null });
    const calls = warn.mock.calls.map((args) => JSON.stringify(args));
    warn.mockRestore();

    expect(result.reply).toMatch(/could not answer/i);
    const capped = calls.filter((text) => text.includes('token cap'));
    expect(capped).toHaveLength(1);
    expect(capped[0]).toContain('"completionTokens":4000');
    expect(capped[0]).not.toContain('sore');
  });
});
