/**
 * Property tests on live plan generation (calls OpenRouter).
 * Skipped unless OPENROUTER_API_KEY is set. Cost and time scale with
 * GEN_PROPERTY_RUNS (default 50, as the spec asks for 50+ profiles).
 * Optional OPENROUTER_MODEL picks a cheaper model for these runs.
 *
 * Requirements: 16.3, 16.4, 16.5, 16.6, 16.7, 16.9, 16.10, 11.3, 11.4, 11.5
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fc from 'fast-check';
import { OpenRouterAssistant } from '../src/providers/openrouter';
import { validateWorkoutPlan, validatePlanSafety } from '../src/validator/index';
import type { Exercise, PlanRequest, WorkoutPlan } from '../src/types';
import catalogData from '../../../catalog/exercises.json';
import { profileArbitrary } from './generators';

const apiKey = process.env.OPENROUTER_API_KEY;
const runs = Number(process.env.GEN_PROPERTY_RUNS ?? 50);
const catalog = catalogData.exercises as Exercise[];
const catalogIds = new Set(catalog.map((ex) => ex.id));

const request: PlanRequest = { duration_days: 3, focus_areas: [] };

function referencedIds(plan: WorkoutPlan): string[] {
  return plan.days.flatMap((d) => d.blocks.flatMap((b) => b.items.map((i) => i.exercise_id)));
}

describe.skipIf(!apiKey)('Property: generated plans (live LLM)', () => {
  // Built in beforeAll, not at describe time: describe bodies run even when skipped,
  // and building the assistant reads config, which exits the process when unset.
  let assistant: OpenRouterAssistant;
  beforeAll(() => {
    assistant = new OpenRouterAssistant({
      apiKey,
      model: process.env.OPENROUTER_MODEL ?? 'anthropic/claude-3.5-sonnet',
    });
  });

  it('Property: FOR ALL generated plans, the plan validates against schema and catalog (16.3)', async () => {
    await fc.assert(
      fc.asyncProperty(profileArbitrary(), async (profile) => {
        const plan = await assistant.generatePlan(profile, request);
        const validation = validateWorkoutPlan(plan, catalog);
        expect(validation.errors).toEqual([]);
        expect(validation.success).toBe(true);
      }),
      { numRuns: runs },
    );
  }, 5 * 60_000);

  it('Property: FOR ALL generated plans, every exercise_id exists in the catalog (16.4)', async () => {
    await fc.assert(
      fc.asyncProperty(profileArbitrary(), async (profile) => {
        const plan = await assistant.generatePlan(profile, request);
        const missing = referencedIds(plan).filter((id) => !catalogIds.has(id));
        expect(missing).toEqual([]);
      }),
      { numRuns: runs },
    );
  }, 5 * 60_000);

  it('Property: FOR ALL profiles with injuries, the generated plan has no injury conflicts (16.5, 16.6)', async () => {
    const withInjuries = profileArbitrary().filter((p) => p.injuries.length > 0);
    await fc.assert(
      fc.asyncProperty(withInjuries, async (profile) => {
        const plan = await assistant.generatePlan(profile, request);
        const safety = validatePlanSafety(plan, profile, catalog);
        expect(safety.violations).toEqual([]);
        expect(safety.success).toBe(true);
      }),
      { numRuns: runs },
    );
  }, 5 * 60_000);
});
