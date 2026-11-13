/**
 * HealthStore on iOS, backed by HealthKit.
 *
 * The library is passed in rather than imported, so this file can be tested without a phone
 * and nothing else in the app depends on HealthKit names.
 *
 * Two HealthKit facts shape this adapter:
 *  - HealthKit never says whether a read was allowed. A type the user denied reads as empty.
 *  - Querying a type that was never requested crashes the app, so nothing is read before the
 *    permission request has been answered.
 */

import type * as HealthKit from '@kingstinct/react-native-healthkit';
import type { ExternalWorkoutType } from '@aura-fit/health-core';

import { buildHealthDays } from './build-health-days';
import { deviceTimeZone, endOfDay, localDayOf, startOfDay } from './local-day';
import {
  EMPTY_RAW_HEALTH,
  type HealthStatus,
  type HealthStore,
  type ProfileHints,
  type RawHealth,
  type WorkoutKind,
  type WorkoutToWrite,
} from './types';

export type HealthKitApi = Pick<
  typeof HealthKit,
  | 'isHealthDataAvailableAsync'
  | 'getRequestStatusForAuthorization'
  | 'requestAuthorization'
  | 'authorizationStatusFor'
  | 'queryStatisticsCollectionForQuantity'
  | 'queryQuantitySamples'
  | 'queryCategorySamples'
  | 'queryWorkoutSamples'
  | 'getMostRecentQuantitySample'
  | 'getDateOfBirthAsync'
  | 'currentAppSource'
  | 'saveWorkoutSample'
  | 'deleteObjects'
  | 'configureBackgroundTypes'
  | 'clearBackgroundTypes'
  | 'subscribeToChanges'
>;

const STEPS = 'HKQuantityTypeIdentifierStepCount';
const ACTIVE_ENERGY = 'HKQuantityTypeIdentifierActiveEnergyBurned';
const RESTING_HR = 'HKQuantityTypeIdentifierRestingHeartRate';
const BODY_MASS = 'HKQuantityTypeIdentifierBodyMass';
const SLEEP = 'HKCategoryTypeIdentifierSleepAnalysis';
const WORKOUT = 'HKWorkoutTypeIdentifier';
const DATE_OF_BIRTH = 'HKCharacteristicTypeIdentifierDateOfBirth';

/** Everything this build reads and writes. app.config.ts describes the same list to the user. */
export const HEALTHKIT_ACCESS = {
  toRead: [STEPS, ACTIVE_ENERGY, RESTING_HR, BODY_MASS, SLEEP, WORKOUT, DATE_OF_BIRTH],
  toShare: [WORKOUT, ACTIVE_ENERGY],
} as const;

// HKUpdateFrequency.hourly: the most often HealthKit delivers steps to an app in the background.
const HOURLY = 2;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const STRETCH_MS = 5 * 60_000;

// HKAuthorizationRequestStatus.unnecessary and HKAuthorizationStatus.sharingAuthorized.
const REQUEST_UNNECESSARY = 2;
const SHARING_AUTHORIZED = 2;

// HKCategoryValueSleepAnalysis: asleepUnspecified 1, asleepCore 3, asleepDeep 4, asleepREM 5.
// 0 is "in bed" and 2 is "awake": neither is sleep.
const ASLEEP_VALUES = new Set([1, 3, 4, 5]);

// HKWorkoutActivityType raw values.
const ACTIVITY_TYPES: Record<number, ExternalWorkoutType> = {
  52: 'walking',
  24: 'walking', // hiking
  37: 'running',
  13: 'cycling',
  46: 'swimming',
  50: 'strength', // traditional strength training
  20: 'strength', // functional strength training
  59: 'strength', // core training
  63: 'hiit',
  73: 'hiit', // mixed cardio
  57: 'yoga',
  66: 'yoga', // pilates
  62: 'yoga', // flexibility
  29: 'yoga', // mind and body
};

const WRITE_ACTIVITY: Record<WorkoutKind, number> = {
  strength: 20, // functional strength training
  hiit: 63, // high intensity interval training
  mobility: 62, // flexibility
};

/**
 * A failed query reads as "no data": health must never take the app down. The failure is
 * noted, because "no data" from a failure must not overwrite what the server already holds.
 */
function reader() {
  const state = { failed: false };
  async function orEmpty<T>(query: () => Promise<readonly T[]>): Promise<readonly T[]> {
    try {
      return await query();
    } catch {
      state.failed = true;
      return [];
    }
  }
  return { orEmpty, state };
}

export function createHealthKitStore(hk: HealthKitApi, timeZone: () => string = deviceTimeZone): HealthStore {
  async function status(): Promise<HealthStatus> {
    try {
      if (!(await hk.isHealthDataAvailableAsync())) return 'unavailable';
      const request = await hk.getRequestStatusForAuthorization(HEALTHKIT_ACCESS);
      return (request as number) === REQUEST_UNNECESSARY ? 'connected' : 'not_connected';
    } catch {
      return 'unavailable';
    }
  }

  async function readRaw(from: string, to: string): Promise<{ raw: RawHealth; complete: boolean }> {
    const { orEmpty, state } = reader();
    const start = startOfDay(from);
    const end = endOfDay(to);
    const date = { startDate: start, endDate: end, strictStartDate: true };
    const daily = { day: 1 };

    const [steps, energy, restingHr, weights, sleep, workouts] = await Promise.all([
      orEmpty(() => hk.queryStatisticsCollectionForQuantity(STEPS, ['cumulativeSum'], start, daily, { filter: { date }, unit: 'count' })),
      orEmpty(() => hk.queryStatisticsCollectionForQuantity(ACTIVE_ENERGY, ['cumulativeSum'], start, daily, { filter: { date }, unit: 'kcal' })),
      orEmpty(() => hk.queryStatisticsCollectionForQuantity(RESTING_HR, ['discreteAverage'], start, daily, { filter: { date }, unit: 'count/min' })),
      orEmpty(() => hk.queryQuantitySamples(BODY_MASS, { filter: { date }, limit: 0, unit: 'kg' })),
      // A night that ended on the first day began the evening before.
      orEmpty(() =>
        hk.queryCategorySamples(SLEEP, {
          filter: { date: { startDate: new Date(start.getTime() - 12 * 3_600_000), endDate: end } },
          limit: 0,
        }),
      ),
      orEmpty(() => hk.queryWorkoutSamples({ filter: { date }, limit: 0 })),
    ]);

    let ownBundle: string | undefined;
    try {
      ownBundle = hk.currentAppSource().bundleIdentifier;
    } catch {
      ownBundle = undefined;
    }

    const totals = (entries: typeof steps, pick: 'sumQuantity' | 'averageQuantity') =>
      entries.flatMap((entry) => {
        const value = entry[pick]?.quantity;
        return entry.startDate && value !== undefined ? [{ day: localDayOf(entry.startDate), value }] : [];
      });

    const raw: RawHealth = {
      steps: totals(steps, 'sumQuantity'),
      activeEnergyKcal: totals(energy, 'sumQuantity'),
      restingHrBpm: totals(restingHr, 'averageQuantity'),
      weightKg: weights.map((sample) => ({ at: sample.startDate, value: sample.quantity })),
      sleep: sleep
        .filter((sample) => ASLEEP_VALUES.has(sample.value as number))
        .map((sample) => ({ start: sample.startDate, end: sample.endDate })),
      workouts: workouts.map((workout) => {
        const energyKcal = workout.totalEnergyBurned?.unit === 'kcal' ? workout.totalEnergyBurned.quantity : undefined;
        return {
          start: workout.startDate,
          end: workout.endDate,
          type: ACTIVITY_TYPES[workout.workoutActivityType as number] ?? 'other',
          own: ownBundle !== undefined && workout.sourceRevision?.source.bundleIdentifier === ownBundle,
          ...(energyKcal === undefined ? {} : { energyKcal }),
        };
      }),
    };
    return { raw, complete: !state.failed };
  }

  async function readDaysChecked(from: string, to: string) {
    const options = { from, to, tz: timeZone(), platform: 'ios' as const };
    if ((await status()) !== 'connected') return { days: buildHealthDays(EMPTY_RAW_HEALTH, options), complete: false };
    const { raw, complete } = await readRaw(from, to);
    return { days: buildHealthDays(raw, options), complete };
  }

  return {
    platform: 'ios',
    status,

    async connect() {
      try {
        await hk.requestAuthorization(HEALTHKIT_ACCESS);
      } catch {
        // The request could not be shown (for example Health is restricted on this device).
      }
      return status();
    },

    async openSettings() {
      const { Linking } = await import('react-native');
      try {
        await Linking.openURL('x-apple-health://');
      } catch {
        await Linking.openSettings();
      }
    },

    readDaysChecked,

    async readDays(from, to) {
      return (await readDaysChecked(from, to)).days;
    },

    async readProfileHints() {
      const hints: ProfileHints = {};
      if ((await status()) !== 'connected') return hints;
      try {
        const weight = await hk.getMostRecentQuantitySample(BODY_MASS, 'kg');
        if (weight && Number.isFinite(weight.quantity) && weight.quantity > 0) {
          hints.weightKg = Math.round(weight.quantity * 10) / 10;
        }
      } catch {
        // No weight is offered.
      }
      try {
        const born = await hk.getDateOfBirthAsync();
        if (born && Number.isFinite(born.getTime())) hints.dateOfBirth = localDayOf(born);
      } catch {
        // No age range is offered.
      }
      return hints;
    },

    async writeWorkout(workout: WorkoutToWrite) {
      try {
        if ((await status()) !== 'connected') return null;
        if ((hk.authorizationStatusFor(WORKOUT) as number) !== SHARING_AUTHORIZED) return null;

        const mayWriteEnergy = (hk.authorizationStatusFor(ACTIVE_ENERGY) as number) === SHARING_AUTHORIZED;
        const quantities =
          mayWriteEnergy && workout.energyKcal !== undefined && workout.energyKcal > 0
            ? [{ quantityType: ACTIVE_ENERGY, quantity: workout.energyKcal, unit: 'kcal', startDate: workout.start, endDate: workout.end } as const]
            : [];

        const saved = await hk.saveWorkoutSample(
          WRITE_ACTIVITY[workout.kind] as unknown as Parameters<HealthKitApi['saveWorkoutSample']>[0],
          quantities,
          workout.start,
          workout.end,
          undefined,
          { HKMetadataKeyWorkoutBrandName: workout.title },
        );
        return saved.uuid;
      } catch {
        return null;
      }
    },

    async deleteWorkout(recordId) {
      // HealthKit keeps a workout's energy samples when the workout is deleted, so they are
      // removed first, through their link to the workout. Failing here must not stop the
      // workout itself from being deleted.
      try {
        const [workout] = await hk.queryWorkoutSamples({ filter: { uuid: recordId }, limit: 1 });
        if (workout) await hk.deleteObjects(ACTIVE_ENERGY, { workout });
      } catch {
        // The energy stays; the workout is still removed below.
      }
      await hk.deleteObjects(WORKOUT, { uuid: recordId });
    },

    async readRecentSteps(now) {
      try {
        if ((await status()) !== 'connected') return null;
        // A whole day is read so that "no steps this hour" can be told from "steps cannot be read".
        // The stretches sit on a fixed five-minute grid, so their ends do not shift from one
        // read to the next (a shifting end would move the planned nudge by minutes every time).
        const start = new Date(Math.floor((now.getTime() - DAY_MS) / STRETCH_MS) * STRETCH_MS);
        const entries = await hk.queryStatisticsCollectionForQuantity(STEPS, ['cumulativeSum'], start, { minute: 5 }, {
          filter: { date: { startDate: start, endDate: now } },
          unit: 'count',
        });
        const totals = entries.flatMap((entry) => {
          const steps = entry.sumQuantity?.quantity;
          const ends = entry.endDate ?? entry.startDate;
          // The stretch that is still running ends now, as far as anyone knows.
          const end = ends && ends.getTime() > now.getTime() ? now : ends;
          return end && steps !== undefined && Number.isFinite(steps) && steps > 0 ? [{ end, steps }] : [];
        });
        if (totals.length === 0) return null;
        return totals.filter(({ end }) => end.getTime() > now.getTime() - HOUR_MS && end.getTime() <= now.getTime());
      } catch {
        return null;
      }
    },

    async setBackground(on) {
      try {
        if (!on) return await hk.clearBackgroundTypes();
        if ((await status()) !== 'connected') return false;
        return await hk.configureBackgroundTypes([STEPS], HOURLY as unknown as Parameters<HealthKitApi['configureBackgroundTypes']>[1]);
      } catch {
        return false;
      }
    },

    watchSteps(handler) {
      try {
        const subscription = hk.subscribeToChanges(STEPS, (change) => {
          if (!change.errorMessage) handler();
        });
        return () => {
          try {
            subscription.remove();
          } catch {
            // Already stopped.
          }
        };
      } catch {
        return () => {};
      }
    },
  };
}
