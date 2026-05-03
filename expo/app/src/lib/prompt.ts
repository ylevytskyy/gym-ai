// Fill the workout-generator-prompt.md template with user inputs and the
// full embedded catalog / schema / sample plan.

import type { PeriodType, UserProfile } from "@src/types";
import { PROMPT_TEMPLATE } from "./prompt-template.generated";
import exercisesStructural from "../../assets/data/exercises.json";
import exercisesTextEn from "../i18n/locales/en/exercises.json";
import planSchemaJson from "../../assets/data/workout-plan.schema.json";
import sampleWeeklyPlanJson from "../../assets/data/sample-weekly-plan.json";

export interface PeriodChoice {
  type: PeriodType;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
}

function asJsonString(v: unknown): string {
  return JSON.stringify(v, null, 2);
}

function mergedCatalogForPrompt(): string {
  const textMap = exercisesTextEn as unknown as Record<
    string,
    { name: string }
  >;
  const structural = exercisesStructural as {
    exercises: Array<{ id: string }>;
  };
  const merged = {
    ...exercisesStructural,
    exercises: structural.exercises.map((e) => ({
      ...e,
      name: textMap[e.id]?.name ?? e.id,
    })),
  };
  return JSON.stringify(merged);
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

  out = out.split("<<EXERCISES_JSON>>").join(mergedCatalogForPrompt());
  out = out
    .split("<<WORKOUT_PLAN_SCHEMA_JSON>>")
    .join(asJsonString(planSchemaJson));
  out = out
    .split("<<SAMPLE_WEEKLY_PLAN_JSON>>")
    .join(asJsonString(sampleWeeklyPlanJson));

  return out;
}
