/**
 * What happens when a session is saved: the log goes to Supabase, then the workout goes to
 * the health store, then the two are linked.
 *
 * Order matters. The log is the user's record and comes first; the health store is a copy.
 * A log gets at most one workout in the health store: when the log is already there (the same
 * session saved again), Health is only written if the log does not point to a record yet. If
 * the link cannot be stored, the health record is removed again; only if that removal fails
 * too can a record stay in Health that the app does not know about.
 *
 * The workout written to Health lasts as long as the session actually ran. Pauses are not
 * exercise, so the record ends at start + active time, not at the wall-clock end.
 */

import type { Exercise } from '@/catalog/catalog';
import type { HealthController } from '@/health/controller';
import type { SessionSummary } from '@/player/session';

import { estimateEnergyKcal } from './model';
import { attachHealthRecord, loadHealthRecordId, saveWorkoutLog, type PlanClient } from './repository';
import type { WorkoutKind } from '@/health/types';

export interface FinishInput {
  logId: string;
  userId: string;
  planId: string;
  dayNumber: number;
  title: string;
  kind: WorkoutKind;
  weightKg: number;
  rating: number | null;
  summary: SessionSummary;
}

export interface FinishResult {
  /** Whether the workout is now also in the health store. */
  health: 'written' | 'not_written';
}

export async function finishWorkout(
  deps: { client: PlanClient; health: Pick<HealthController, 'writeWorkout' | 'deleteWorkout'>; exercise: (id: string) => Exercise | undefined },
  input: FinishInput,
): Promise<FinishResult> {
  const { summary } = input;
  // Throws a PlanError when the log cannot be saved: nothing is written to Health in that case.
  const outcome = await saveWorkoutLog(deps.client, input.userId, {
    id: input.logId,
    plan_id: input.planId,
    day_number: input.dayNumber,
    exercises_completed: summary.exercises_completed,
    duration_minutes: summary.duration_minutes,
    rating: input.rating,
    completed_at: new Date(summary.finishedAt).toISOString(),
  });

  if (outcome === 'existed' && (await loadHealthRecordId(deps.client, input.userId, input.logId))) {
    return { health: 'written' };
  }

  const energyKcal = estimateEnergyKcal(summary.workMsByExercise, input.weightKg, deps.exercise);
  let recordId: string | null = null;
  try {
    recordId = await deps.health.writeWorkout({
      start: new Date(summary.startedAt),
      end: new Date(summary.startedAt + Math.max(1000, summary.activeMs)),
      kind: input.kind,
      title: input.title,
      ...(energyKcal > 0 ? { energyKcal } : {}),
    });
  } catch {
    recordId = null;
  }
  if (!recordId) return { health: 'not_written' };

  try {
    await attachHealthRecord(deps.client, input.userId, input.logId, recordId);
    return { health: 'written' };
  } catch {
    // Without the link the app could never find or delete this record again: take it back.
    await deps.health.deleteWorkout(recordId).catch(() => undefined);
    return { health: 'not_written' };
  }
}
