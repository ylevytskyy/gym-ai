// The profile stored inside the app (in profileStore). A superset of the onboarding
// data — schedule details are filled in the first time the user taps Generate Plan.

import type { FitnessLevel, Goal, Limitation } from "./enums";
import type { WorkSchedule } from "./plan";

export interface UserProfile {
  // ─── collected during onboarding ──────────────────────────────────────
  name: string;
  date_of_birth: string; // YYYY-MM-DD
  weight_kg: number;
  height_cm: number;
  fitness_level: FitnessLevel;
  primary_goals: Goal[];
  photo_uri: string | null;

  // ─── collected at first Generate Plan ─────────────────────────────────
  work_schedule: WorkSchedule | null;
  available_minutes_per_day: number | null;
  limitations: Limitation[];
  disliked_exercise_ids: string[];
}

export function hasPlanInputs(p: UserProfile): boolean {
  return (
    p.work_schedule !== null && p.available_minutes_per_day !== null
  );
}
