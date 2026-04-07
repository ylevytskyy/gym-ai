// All string literal unions used across the schema — mirror workout-plan.schema.json exactly.

export type Goal =
  | "belly_fat"
  | "weight_loss"
  | "posture"
  | "core_strength"
  | "cardiovascular_health"
  | "flexibility"
  | "general_fitness"
  | "muscle_tone"
  | "stress_relief";

export const ALL_GOALS: Goal[] = [
  "belly_fat",
  "weight_loss",
  "posture",
  "core_strength",
  "cardiovascular_health",
  "flexibility",
  "general_fitness",
  "muscle_tone",
  "stress_relief",
];

export type Limitation =
  | "lower_back_injury"
  | "lower_back_pain"
  | "knee_injury"
  | "knee_pain"
  | "wrist_injury"
  | "wrist_pain"
  | "shoulder_injury"
  | "shoulder_pain"
  | "neck_injury"
  | "elbow_injury"
  | "ankle_injury"
  | "hip_injury"
  | "high_blood_pressure"
  | "balance_issues"
  | "vertigo"
  | "pregnancy_late_term"
  | "none";

export const ALL_LIMITATIONS: Limitation[] = [
  "none",
  "lower_back_pain",
  "lower_back_injury",
  "knee_pain",
  "knee_injury",
  "wrist_pain",
  "wrist_injury",
  "shoulder_pain",
  "shoulder_injury",
  "neck_injury",
  "elbow_injury",
  "ankle_injury",
  "hip_injury",
  "high_blood_pressure",
  "balance_issues",
  "vertigo",
  "pregnancy_late_term",
];

export type FitnessLevel = "beginner" | "intermediate" | "advanced";
export const ALL_FITNESS_LEVELS: FitnessLevel[] = ["beginner", "intermediate", "advanced"];

export type MeetingDensity = "low" | "medium" | "high";
export const ALL_MEETING_DENSITIES: MeetingDensity[] = ["low", "medium", "high"];

export type PeriodType = "weekly" | "monthly" | "custom";

export type SessionType =
  | "main_workout"
  | "desk_break"
  | "stair_cardio"
  | "stretching";

export type Priority = "required" | "preferred" | "optional";

export type Intensity = "low" | "medium" | "high";

export type BlockType = "warmup" | "main" | "cooldown" | "circuit";

export type Unit = "reps" | "seconds" | "meters_climbed";

export type ExecutionStatus = "pending" | "completed" | "partial" | "skipped";

export type RescheduleePolicy = "fold_forward" | "defer_to_tomorrow" | "drop";

export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type ExerciseCategory =
  | "desk_break"
  | "cardio"
  | "strength_lower"
  | "strength_upper"
  | "core"
  | "flexibility"
  | "stair"
  | "mobility";

export type NoiseLevel = "silent" | "quiet" | "moderate";
export type DefaultUnit = Unit;

// Human labels for the UI.
export const GOAL_LABELS: Record<Goal, string> = {
  belly_fat: "Lose belly fat",
  weight_loss: "Weight loss",
  posture: "Better posture",
  core_strength: "Core strength",
  cardiovascular_health: "Cardio health",
  flexibility: "Flexibility",
  general_fitness: "General fitness",
  muscle_tone: "Muscle tone",
  stress_relief: "Stress relief",
};

export const LIMITATION_LABELS: Record<Limitation, string> = {
  none: "None",
  lower_back_pain: "Lower back pain",
  lower_back_injury: "Lower back injury",
  knee_pain: "Knee pain",
  knee_injury: "Knee injury",
  wrist_pain: "Wrist pain",
  wrist_injury: "Wrist injury",
  shoulder_pain: "Shoulder pain",
  shoulder_injury: "Shoulder injury",
  neck_injury: "Neck injury",
  elbow_injury: "Elbow injury",
  ankle_injury: "Ankle injury",
  hip_injury: "Hip injury",
  high_blood_pressure: "High blood pressure",
  balance_issues: "Balance issues",
  vertigo: "Vertigo",
  pregnancy_late_term: "Late-term pregnancy",
};

export const FITNESS_LEVEL_LABELS: Record<FitnessLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const MEETING_DENSITY_LABELS: Record<MeetingDensity, string> = {
  low: "Low — few meetings, long focus blocks",
  medium: "Medium — typical calendar",
  high: "High — back-to-back meetings",
};

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  main_workout: "Main workout",
  desk_break: "Desk break",
  stair_cardio: "Stair cardio",
  stretching: "Stretching",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  required: "Required",
  preferred: "Preferred",
  optional: "Optional",
};
