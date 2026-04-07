// Validates a pasted LLM response against the JSON Schema AND cross-references
// every exercise_id against the bundled catalog.

import Ajv, { type ErrorObject } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import type { WorkoutPlan } from "@src/types";
import { allExerciseIds, exerciseById } from "./catalog";
// eslint-disable-next-line @typescript-eslint/no-var-requires
import planSchemaJson from "../../assets/data/workout-plan.schema.json";

export interface ValidationError {
  path: string;
  message: string;
  hint?: string;
}

export type ValidationResult =
  | { ok: true; plan: WorkoutPlan; warnings: string[] }
  | { ok: false; errors: ValidationError[] };

// Pre-compile the schema once at module load.
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const compiled = ajv.compile(planSchemaJson as object);
const CATALOG_IDS = new Set(allExerciseIds());

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  let prev = new Array(bl + 1).fill(0);
  let curr = new Array(bl + 1).fill(0);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[bl];
}

function closestId(id: string): string | undefined {
  let best: string | undefined;
  let bestDist = 4;
  for (const cand of CATALOG_IDS) {
    const d = levenshtein(id, cand);
    if (d < bestDist) {
      best = cand;
      bestDist = d;
      if (bestDist <= 1) break;
    }
  }
  return best;
}

function ajvErrorToValidationError(e: ErrorObject): ValidationError {
  const path = e.instancePath || "(root)";
  let msg = e.message ?? "invalid";
  if (e.keyword === "enum" && e.params?.allowedValues) {
    msg += `: expected one of [${(e.params.allowedValues as string[]).join(", ")}]`;
  } else if (e.keyword === "const" && e.params?.allowedValue !== undefined) {
    msg += `: expected ${JSON.stringify(e.params.allowedValue)}`;
  } else if (e.keyword === "required" && e.params?.missingProperty) {
    msg = `missing required property '${e.params.missingProperty}'`;
  } else if (e.keyword === "additionalProperties" && e.params?.additionalProperty) {
    msg = `unexpected additional property '${e.params.additionalProperty}'`;
  }
  return { path, message: msg };
}

export function validatePlan(raw: string): ValidationResult {
  // Step 1: JSON parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    const m = e instanceof Error ? e.message : "unknown error";
    return {
      ok: false,
      errors: [{ path: "(raw)", message: `JSON parse error: ${m}` }],
    };
  }

  // Step 2: ajv schema validation
  const valid = compiled(parsed);
  if (!valid) {
    const errs = (compiled.errors ?? []).map(ajvErrorToValidationError);
    return { ok: false, errors: errs };
  }
  const plan = parsed as WorkoutPlan;

  // Step 3: cross-reference exercise_ids
  const xrefErrors: ValidationError[] = [];
  plan.plan.days.forEach((day, dayIdx) => {
    day.sessions.forEach((session, sessIdx) => {
      session.blocks.forEach((block, blockIdx) => {
        block.exercises.forEach((ex, exIdx) => {
          if (!exerciseById(ex.exercise_id)) {
            const path = `/plan/days/${dayIdx}/sessions/${sessIdx}/blocks/${blockIdx}/exercises/${exIdx}/exercise_id`;
            const suggestion = closestId(ex.exercise_id);
            xrefErrors.push({
              path,
              message: `Exercise '${ex.exercise_id}' not found in catalog`,
              hint: suggestion ? `did you mean '${suggestion}'?` : undefined,
            });
          }
        });
      });
    });
  });
  if (xrefErrors.length > 0) {
    return { ok: false, errors: xrefErrors };
  }

  // Step 4: version checks
  if (plan.schema_version !== "1.0.0") {
    return {
      ok: false,
      errors: [
        {
          path: "/schema_version",
          message: `Expected schema_version "1.0.0", got "${plan.schema_version}"`,
        },
      ],
    };
  }
  if (plan.plan.summary.calorie_model_version !== "1.0.0") {
    return {
      ok: false,
      errors: [
        {
          path: "/plan/summary/calorie_model_version",
          message: `Expected calorie_model_version "1.0.0", got "${plan.plan.summary.calorie_model_version}"`,
        },
      ],
    };
  }

  return { ok: true, plan, warnings: [] };
}

export interface PlanPreviewStats {
  days: number;
  activeDays: number;
  totalSessions: number;
  totalExercises: number;
  caloriesMin: number;
  caloriesMax: number;
  periodStart: string;
  periodEnd: string;
}

export function planPreviewStats(plan: WorkoutPlan): PlanPreviewStats {
  let totalSessions = 0;
  let totalExercises = 0;
  let activeDays = 0;
  for (const day of plan.plan.days) {
    if (!day.is_rest_day) activeDays++;
    for (const session of day.sessions) {
      totalSessions++;
      for (const block of session.blocks) {
        totalExercises += block.exercises.length * block.rounds;
      }
    }
  }
  return {
    days: plan.plan.days.length,
    activeDays,
    totalSessions,
    totalExercises,
    caloriesMin: plan.plan.summary.estimated_period_calories_min,
    caloriesMax: plan.plan.summary.estimated_period_calories_max,
    periodStart: plan.plan.period.start_date,
    periodEnd: plan.plan.period.end_date,
  };
}
