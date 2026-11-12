/**
 * The one surface the app uses to talk to the phone's health store (HealthKit on iOS, Health
 * Connect on Android). Screens and providers depend on HealthStore only; they never import a
 * health library or see one of its identifiers.
 */

import type { ExternalWorkoutType, HealthDay } from '@aura-fit/health-core';

/**
 * - `unavailable`: this phone has no health store (or it cannot be used).
 * - `needs_update`: Android only; Health Connect must be installed or updated first.
 * - `not_connected`: the permission request has not been answered yet.
 * - `connected`: the request has been answered. On iOS this does not mean every read was
 *   allowed: HealthKit never reveals that, a denied type simply reads as "no data".
 */
export type HealthStatus = 'unavailable' | 'needs_update' | 'not_connected' | 'connected';

/** Values the profile form may offer. Nothing here is saved until the user confirms it. */
export interface ProfileHints {
  weightKg?: number;
  /** YYYY-MM-DD. iOS only: Health Connect has no date of birth. */
  dateOfBirth?: string;
}

export interface CheckedDays {
  days: HealthDay[];
  /** False when at least one read failed (not when a type simply has no data or was denied). */
  complete: boolean;
}

export type WorkoutKind = 'strength' | 'hiit' | 'mobility';

export interface WorkoutToWrite {
  start: Date;
  end: Date;
  kind: WorkoutKind;
  title: string;
  energyKcal?: number;
}

export interface HealthStore {
  readonly platform: 'ios' | 'android';
  status(): Promise<HealthStatus>;
  /** Shows the system permission request when it still needs showing; resolves to the new status. */
  connect(): Promise<HealthStatus>;
  /** Opens the place where the user changes or revokes access. */
  openSettings(): Promise<void>;
  /** Health days from `from` to `to` (YYYY-MM-DD, local, inclusive), oldest first. */
  readDays(from: string, to: string): Promise<HealthDay[]>;
  /**
   * The same days, plus whether every read succeeded. A failed read looks like "no data" in
   * the days themselves, so anything that would overwrite stored data must check `complete`.
   */
  readDaysChecked(from: string, to: string): Promise<CheckedDays>;
  readProfileHints(): Promise<ProfileHints>;
  /** Saves a finished workout; resolves to the health store's record id, or null when writing is not allowed. */
  writeWorkout(workout: WorkoutToWrite): Promise<string | null>;
  deleteWorkout(recordId: string): Promise<void>;
}

/** What an adapter hands to buildHealthDays: readings in platform-neutral form. */
export interface RawHealth {
  steps: { day: string; value: number }[];
  activeEnergyKcal: { day: string; value: number }[];
  restingHrBpm: { day: string; value: number }[];
  weightKg: { at: Date; value: number }[];
  /** Asleep time only (no "in bed", no "awake"); may overlap across sources. */
  sleep: { start: Date; end: Date }[];
  workouts: { start: Date; end: Date; type: ExternalWorkoutType; energyKcal?: number; own: boolean }[];
}

export const EMPTY_RAW_HEALTH: RawHealth = {
  steps: [],
  activeEnergyKcal: [],
  restingHrBpm: [],
  weightKg: [],
  sleep: [],
  workouts: [],
};
