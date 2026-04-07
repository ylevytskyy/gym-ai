// Types for the workout plan JSON — mirror workout-plan.schema.json exactly.

import type {
  BlockType,
  DayOfWeek,
  ExecutionStatus,
  FitnessLevel,
  Goal,
  Intensity,
  Limitation,
  MeetingDensity,
  PeriodType,
  Priority,
  RescheduleePolicy,
  SessionType,
  Unit,
} from "./enums";

export interface Period {
  type: PeriodType;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
}

export interface TimeRange {
  start: string; // HH:MM (24-hour)
  end: string; // HH:MM (24-hour)
}

export interface WorkSchedule {
  work_hours: TimeRange;
  typical_meeting_density: MeetingDensity;
  protected_focus_blocks?: TimeRange[];
  lunch_break?: TimeRange;
}

export interface PlanUserProfile {
  date_of_birth: string; // YYYY-MM-DD
  weight_kg: number;
  height_cm: number;
  fitness_level: FitnessLevel;
  primary_goals: Goal[];
  available_minutes_per_day: number;
  limitations: Limitation[];
  disliked_exercise_ids: string[];
  work_schedule: WorkSchedule;
}

export interface WeeklyProgressionEntry {
  week: number;
  intensity_multiplier: number;
  notes?: string | null;
}

export interface Flexibility {
  reschedule_policy: RescheduleePolicy;
  max_postpones_per_session: number;
  min_required_sessions_per_day: number;
  buffer_minutes_between_sessions: number;
}

export interface WeeklyStructure {
  rest_days: DayOfWeek[];
  weekly_progression: WeeklyProgressionEntry[];
  flexibility: Flexibility;
}

export interface ExerciseExecution {
  status: ExecutionStatus;
  actual_sets_completed: number;
  actual_amount_per_set: number[];
  actual_work_seconds: number;
  perceived_effort_rpe: number | null;
  actual_calories: number;
  completed_at: string | null; // ISO-8601 UTC
}

export interface PlannedExercise {
  exercise_id: string;
  order: number;
  sets: number;
  amount: number;
  unit: Unit;
  rest_seconds: number;
  notes?: string | null;
  estimated_calories: number;
  execution: ExerciseExecution;
}

export interface Block {
  block_type: BlockType;
  rounds: number;
  exercises: PlannedExercise[];
}

export interface TimeWindow {
  earliest: string; // HH:MM
  latest: string; // HH:MM
}

export interface SessionExecution {
  status: ExecutionStatus;
  actual_start_time: string | null;
  actual_duration_minutes: number;
  actual_calories_total: number;
  completion_percentage: number;
}

export interface Session {
  session_id: string;
  type: SessionType;
  priority: Priority;
  time_window: TimeWindow;
  duration_minutes: number;
  min_gap_from_previous_minutes: number;
  can_split: boolean;
  intensity: Intensity;
  estimated_calories_total: number;
  blocks: Block[];
  execution: SessionExecution;
}

export interface Day {
  date: string; // YYYY-MM-DD
  day_of_week: DayOfWeek;
  is_rest_day: boolean;
  estimated_minutes_min: number;
  estimated_minutes_max: number;
  estimated_calories_min: number;
  estimated_calories_max: number;
  actual_calories_total: number;
  completion_percentage: number;
  sessions: Session[];
}

export interface Summary {
  estimated_period_calories_min: number;
  estimated_period_calories_max: number;
  estimated_average_daily_calories: number;
  actual_period_calories: number;
  calorie_model_version: "1.0.0";
}

export interface Plan {
  id: string;
  generated_at: string; // ISO-8601 UTC
  period: Period;
  user_profile: PlanUserProfile;
  weekly_structure: WeeklyStructure;
  days: Day[];
  summary: Summary;
}

export interface WorkoutPlan {
  schema_version: "1.0.0";
  plan: Plan;
}
