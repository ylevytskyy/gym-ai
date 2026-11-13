/**
 * Shapes shared by the health rules.
 *
 * HealthDay mirrors schemas/health-day.schema.json. The workout shapes are the parts of the
 * workout plan and the exercise catalog that the rules read; they are structural, so the
 * assistant service's and the app's own types can be passed in directly.
 */

export type ExternalWorkoutType =
  | 'walking'
  | 'running'
  | 'cycling'
  | 'swimming'
  | 'strength'
  | 'hiit'
  | 'yoga'
  | 'sport'
  | 'other';

export interface ExternalWorkout {
  type: ExternalWorkoutType;
  minutes: number;
  energy_kcal?: number;
}

/** One user's totals for one local calendar day. An absent field means no data, never zero. */
export interface HealthDay {
  day: string; // YYYY-MM-DD, local
  tz: string; // IANA time zone
  platform: 'ios' | 'android';
  steps?: number;
  active_energy_kcal?: number;
  resting_hr_bpm?: number;
  sleep_minutes?: number;
  weight_kg?: number;
  external_workouts?: ExternalWorkout[];
}

export type ReadinessLevel = 'low' | 'normal' | 'high' | 'unknown';

export type ReadinessReason =
  | 'short_sleep'
  | 'sleep_below_baseline'
  | 'resting_hr_elevated'
  | 'well_recovered'
  | 'not_enough_data';

export interface Readiness {
  level: ReadinessLevel;
  reasons: ReadinessReason[];
}

export type ExerciseGroup = 'warm_up' | 'lower_body' | 'upper_body' | 'core' | 'cardio';

/** The catalog fields the rules read. */
export interface CatalogExercise {
  id: string;
  group: ExerciseGroup;
  level: 1 | 2 | 3;
  unit: 'reps' | 'seconds';
  default: { sets: number; amount: number; rest_seconds: number };
  avoid_if: string[];
  quiet: boolean;
}

export interface ExerciseItem {
  exercise_id: string;
  sets: number;
  amount: number;
  rest_seconds?: number;
}

export interface WorkoutBlock {
  type: 'warm_up' | 'main' | 'cool_down';
  items: ExerciseItem[];
}

export interface WorkoutDay {
  day: number;
  title: string;
  minutes: number;
  blocks: WorkoutBlock[];
}
