// Fill the workout-generator-prompt.md template with user inputs and the
// full embedded catalog / schema / sample plan.

import type { PeriodType, UserProfile } from "@src/types";
import { PROMPT_TEMPLATE } from "./prompt-template.generated";
// eslint-disable-next-line @typescript-eslint/no-var-requires
import exercisesStructural from "../../assets/data/exercises.json";
// eslint-disable-next-line @typescript-eslint/no-var-requires
import exercisesTextEn from "../i18n/locales/en/exercises.json";
// eslint-disable-next-line @typescript-eslint/no-var-requires
import planSchemaJson from "../../assets/data/workout-plan.schema.json";
// eslint-disable-next-line @typescript-eslint/no-var-requires
import sampleWeeklyPlanJson from "../../assets/data/sample-weekly-plan.json";

export interface PeriodChoice {
  type: PeriodType;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
}

function asJsonString(v: unknown): string {
  return JSON.stringify(v, null, 2);
}

type ExerciseTextEntry = {
  name: string;
  instructions: string[];
  common_mistakes: string[];
  modifications: { easier: string; harder: string };
  notes: string | null;
};

// Merges the structural catalog with the English exercise-text dictionary so
// the LLM receives the same full-text shape it always has. The LLM keeps
// emitting English exercise ids regardless of the app's current language.
function mergedCatalogForPrompt(): object {
  const textMap = exercisesTextEn as unknown as Record<string, ExerciseTextEntry>;
  const structural = exercisesStructural as { exercises: Array<{ id: string }> };
  return {
    ...exercisesStructural,
    exercises: structural.exercises.map((e) => ({
      ...e,
      ...(textMap[e.id] ?? {}),
    })),
  };
}

export function buildPrompt(
  profile: UserProfile,
  period: PeriodChoice,
): string {
  if (!profile.work_schedule || profile.available_minutes_per_day == null) {
    throw new Error(
      "Profile is missing schedule details. Fill them in Generate Plan before building the prompt.",
    );
  }

  const ws = profile.work_schedule;
  const focusBlocks = ws.protected_focus_blocks ?? [];
  const lunch = ws.lunch_break;

  const replacements: Record<string, string> = {
    "{{date_of_birth}}": profile.date_of_birth,
    "{{weight_kg}}": String(profile.weight_kg),
    "{{height_cm}}": String(profile.height_cm),
    "{{period_type}}": period.type,
    "{{period_start_date}}": period.start_date,
    "{{period_end_date}}": period.end_date,
    "{{fitness_level}}": profile.fitness_level,
    "{{primary_goals}}": JSON.stringify(profile.primary_goals),
    "{{available_minutes_per_day}}": String(profile.available_minutes_per_day),
    "{{work_hours_start}}": ws.work_hours.start,
    "{{work_hours_end}}": ws.work_hours.end,
    "{{typical_meeting_density}}": ws.typical_meeting_density,
    "{{protected_focus_blocks}}": JSON.stringify(focusBlocks),
    "{{lunch_break_start}}": lunch?.start ?? "null",
    "{{lunch_break_end}}": lunch?.end ?? "null",
    "{{limitations}}": JSON.stringify(profile.limitations),
    "{{disliked_exercise_ids}}": JSON.stringify(profile.disliked_exercise_ids),
  };

  let out = PROMPT_TEMPLATE;
  for (const [k, v] of Object.entries(replacements)) {
    out = out.split(k).join(v);
  }

  out = out.split("<<EXERCISES_JSON>>").join(asJsonString(mergedCatalogForPrompt()));
  out = out
    .split("<<WORKOUT_PLAN_SCHEMA_JSON>>")
    .join(asJsonString(planSchemaJson));
  out = out
    .split("<<SAMPLE_WEEKLY_PLAN_JSON>>")
    .join(asJsonString(sampleWeeklyPlanJson));

  return out;
}
