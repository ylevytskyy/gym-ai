// Calorie math — mirrors the formula in exercises.json → calorie_model.
// Used both to display planning-time estimates and to compute live actuals
// during/after a workout.

import type {
  Block,
  Day,
  Exercise,
  ExerciseExecution,
  Intensity,
  PlannedExercise,
  Session,
  Unit,
  WorkoutPlan,
} from "@src/types";
import { getCatalog, exerciseById } from "./catalog";

const MODEL = getCatalog().calorie_model;

const METERS_PER_SECOND = 0.25; // 4 seconds per meter climbed (from the prompt)

function workSecondsFromPlan(
  unit: Unit,
  sets: number,
  amount: number,
  secondsPerRep: number | null,
): number {
  if (unit === "seconds") return sets * amount;
  if (unit === "reps") return sets * amount * (secondsPerRep ?? 2.5);
  // meters_climbed
  return sets * amount * (1 / METERS_PER_SECOND);
}

function workSecondsFromActuals(
  unit: Unit,
  execution: ExerciseExecution,
  secondsPerRep: number | null,
): number {
  if (execution.actual_work_seconds > 0) return execution.actual_work_seconds;
  const totalAmount = execution.actual_amount_per_set.reduce((a, b) => a + b, 0);
  if (unit === "seconds") return totalAmount;
  if (unit === "reps") return totalAmount * (secondsPerRep ?? 2.5);
  return totalAmount * (1 / METERS_PER_SECOND);
}

function kcalFromWorkSeconds(
  workSeconds: number,
  metValue: number,
  weightKg: number,
  intensity: Intensity,
): number {
  const workMinutes = workSeconds / 60;
  const kcalPerMin = (metValue * weightKg) / 60;
  const mult = MODEL.intensity_multipliers[intensity];
  return round2(kcalPerMin * workMinutes * mult);
}

export function estimatedCalories(
  ex: PlannedExercise,
  intensity: Intensity,
  weightKg: number,
  catalogEx: Exercise,
): number {
  const workSec = workSecondsFromPlan(
    ex.unit,
    ex.sets,
    ex.amount,
    catalogEx.seconds_per_rep,
  );
  return kcalFromWorkSeconds(workSec, catalogEx.met_value, weightKg, intensity);
}

export function actualCalories(
  ex: PlannedExercise,
  intensity: Intensity,
  weightKg: number,
  catalogEx: Exercise,
): number {
  if (ex.execution.status !== "completed" && ex.execution.status !== "partial") {
    return 0;
  }
  const workSec = workSecondsFromActuals(
    ex.unit,
    ex.execution,
    catalogEx.seconds_per_rep,
  );
  return kcalFromWorkSeconds(workSec, catalogEx.met_value, weightKg, intensity);
}

export function rollupSession(session: Session, weightKg: number): number {
  let total = 0;
  for (const block of session.blocks) {
    for (const ex of block.exercises) {
      const cat = exerciseById(ex.exercise_id);
      if (!cat) continue;
      total += actualCalories(ex, session.intensity, weightKg, cat) * block.rounds;
    }
  }
  return round2(total);
}

export function rollupDay(day: Day, weightKg: number): number {
  let total = 0;
  for (const session of day.sessions) {
    total += session.execution.actual_calories_total;
  }
  // If session rollups haven't been run yet, recompute.
  if (total === 0 && day.sessions.length > 0) {
    for (const session of day.sessions) {
      total += rollupSession(session, weightKg);
    }
  }
  return round2(total);
}

export function rollupPlan(plan: WorkoutPlan, weightKg: number): number {
  let total = 0;
  for (const day of plan.plan.days) {
    total += day.actual_calories_total;
  }
  return round2(total);
}

// Recompute all actuals in a plan and return a new plan object.
// Pure function so the store can use it via setPlan(recomputeActuals(...)).
export function recomputeActuals(
  plan: WorkoutPlan,
  weightKg: number,
): WorkoutPlan {
  const nextDays: Day[] = plan.plan.days.map((day) => {
    const nextSessions: Session[] = day.sessions.map((session) => {
      const nextBlocks: Block[] = session.blocks.map((block) => ({
        ...block,
        exercises: block.exercises.map((ex) => {
          const cat = exerciseById(ex.exercise_id);
          const actual = cat
            ? actualCalories(ex, session.intensity, weightKg, cat)
            : 0;
          return {
            ...ex,
            execution: { ...ex.execution, actual_calories: actual },
          };
        }),
      }));

      // sum session
      let sessionTotal = 0;
      for (const block of nextBlocks) {
        for (const ex of block.exercises) {
          sessionTotal += ex.execution.actual_calories * block.rounds;
        }
      }
      const allPending = nextBlocks
        .flatMap((b) => b.exercises)
        .every((e) => e.execution.status === "pending");
      const allDone = nextBlocks
        .flatMap((b) => b.exercises)
        .every(
          (e) =>
            e.execution.status === "completed" ||
            e.execution.status === "skipped",
        );
      const completionPct = (() => {
        const all = nextBlocks.flatMap((b) => b.exercises);
        if (all.length === 0) return 0;
        const done = all.filter(
          (e) => e.execution.status === "completed",
        ).length;
        return round2((done / all.length) * 100);
      })();

      return {
        ...session,
        blocks: nextBlocks,
        execution: {
          ...session.execution,
          actual_calories_total: round2(sessionTotal),
          completion_percentage: completionPct,
          status: allPending
            ? "pending"
            : allDone
              ? "completed"
              : "partial",
        },
      };
    });

    let dayTotal = 0;
    for (const s of nextSessions) {
      dayTotal += s.execution.actual_calories_total;
    }
    const dayPct = (() => {
      if (nextSessions.length === 0) return 0;
      const sum = nextSessions.reduce(
        (acc, s) => acc + s.execution.completion_percentage,
        0,
      );
      return round2(sum / nextSessions.length);
    })();

    return {
      ...day,
      sessions: nextSessions,
      actual_calories_total: round2(dayTotal),
      completion_percentage: dayPct,
    };
  });

  const periodTotal = nextDays.reduce(
    (acc, d) => acc + d.actual_calories_total,
    0,
  );

  return {
    ...plan,
    plan: {
      ...plan.plan,
      days: nextDays,
      summary: {
        ...plan.plan.summary,
        actual_period_calories: round2(periodTotal),
      },
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
