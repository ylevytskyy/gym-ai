/**
 * HealthStore on Android, backed by Health Connect.
 *
 * The library is passed in rather than imported, so this file can be tested without a phone
 * and nothing else in the app depends on Health Connect names.
 *
 * Health Connect facts that shape this adapter:
 *  - Reading a record type without its permission throws, so every read is guarded by the
 *    granted permissions and a failed read counts as "no data".
 *  - Revoking permissions from the app only takes effect after a restart, so the app never
 *    revokes: disconnecting is the app's own state, and the user is sent to Health Connect.
 *  - There is no date of birth, so only weight can be offered for the profile.
 */

import type * as HealthConnect from 'react-native-health-connect';
import type { ExternalWorkoutType } from '@aura-fit/health-core';

import { buildHealthDays } from './build-health-days';
import { daysInRange, deviceTimeZone, endOfDay, startOfDay } from './local-day';
import {
  EMPTY_RAW_HEALTH,
  type HealthStatus,
  type HealthStore,
  type ProfileHints,
  type RawHealth,
  type WorkoutKind,
  type WorkoutToWrite,
} from './types';

export type HealthConnectApi = Pick<
  typeof HealthConnect,
  | 'getSdkStatus'
  | 'initialize'
  | 'requestPermission'
  | 'getGrantedPermissions'
  | 'aggregateRecord'
  | 'aggregateGroupByDuration'
  | 'readRecords'
  | 'insertRecords'
  | 'deleteRecordsByUuids'
  | 'openHealthConnectSettings'
>;

type ReadType = 'Steps' | 'ActiveCaloriesBurned' | 'RestingHeartRate' | 'SleepSession' | 'Weight' | 'ExerciseSession';
type WriteType = 'ExerciseSession' | 'ActiveCaloriesBurned';

const READ_TYPES: ReadType[] = ['Steps', 'ActiveCaloriesBurned', 'RestingHeartRate', 'SleepSession', 'Weight', 'ExerciseSession'];
const WRITE_TYPES: WriteType[] = ['ExerciseSession', 'ActiveCaloriesBurned'];

/** Everything this build reads and writes. app.config.ts declares the matching manifest permissions. */
export const HEALTH_CONNECT_ACCESS = [
  ...READ_TYPES.map((recordType) => ({ accessType: 'read' as const, recordType })),
  ...WRITE_TYPES.map((recordType) => ({ accessType: 'write' as const, recordType })),
];

/** Reading while the app is closed: a separate permission, asked for only when nudges are turned on. */
const BACKGROUND_READ = { accessType: 'read' as const, recordType: 'BackgroundAccessPermission' as const };
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const STRETCH_MS = 5 * 60_000;

// SdkAvailabilityStatus
const SDK_UPDATE_REQUIRED = 2;
const SDK_AVAILABLE = 3;

// ExerciseSessionRecord exercise types.
const EXERCISE_TYPES: Record<number, ExternalWorkoutType> = {
  79: 'walking',
  37: 'walking', // hiking
  56: 'running',
  57: 'running', // treadmill
  8: 'cycling',
  9: 'cycling', // stationary bike
  74: 'swimming', // pool
  73: 'swimming', // open water
  70: 'strength',
  81: 'strength', // weightlifting
  13: 'strength', // calisthenics
  36: 'hiit',
  10: 'hiit', // boot camp
  83: 'yoga',
  48: 'yoga', // pilates
  71: 'yoga', // stretching
};

const WRITE_EXERCISE: Record<WorkoutKind, number> = {
  strength: 13, // calisthenics: bodyweight strength
  hiit: 36,
  mobility: 71, // stretching
};

// SleepSessionRecord stage types that are not sleep: awake 1, out of bed 3, awake in bed 7.
const AWAKE_STAGES = new Set([1, 3, 7]);

async function orUndefined<T>(call: () => Promise<T>, onFailure?: () => void): Promise<T | undefined> {
  try {
    return await call();
  } catch {
    onFailure?.();
    return undefined;
  }
}

export function createHealthConnectStore(
  hc: HealthConnectApi,
  appId: string,
  timeZone: () => string = deviceTimeZone,
): HealthStore {
  let initialized = false;

  /** `available` once the client is ready; Health Connect must be initialised before any other call. */
  async function availability(): Promise<'available' | 'needs_update' | 'unavailable'> {
    try {
      const sdk = await hc.getSdkStatus();
      if (sdk === SDK_UPDATE_REQUIRED) return 'needs_update';
      if (sdk !== SDK_AVAILABLE) return 'unavailable';
      if (!initialized) initialized = await hc.initialize();
      return initialized ? 'available' : 'unavailable';
    } catch {
      return 'unavailable';
    }
  }

  async function granted(): Promise<{ read: Set<string>; write: Set<string> }> {
    const permissions = (await orUndefined(() => hc.getGrantedPermissions())) ?? [];
    const of = (access: 'read' | 'write') =>
      new Set(permissions.filter((p) => p.accessType === access).map((p) => p.recordType as string));
    return { read: of('read'), write: of('write') };
  }

  async function status(): Promise<HealthStatus> {
    const available = await availability();
    if (available !== 'available') return available;
    const { read, write } = await granted();
    const any = READ_TYPES.some((t) => read.has(t)) || WRITE_TYPES.some((t) => write.has(t));
    return any ? 'connected' : 'not_connected';
  }

  async function readRaw(from: string, to: string, read: Set<string>): Promise<{ raw: RawHealth; complete: boolean }> {
    // A failed read looks like "no data"; it is noted so it never overwrites stored data.
    let failed = false;
    const note = () => {
      failed = true;
    };
    const range = { operator: 'between' as const, startTime: startOfDay(from).toISOString(), endTime: endOfDay(to).toISOString() };
    const days = daysInRange(from, to);
    const dayRange = (day: string) => ({
      operator: 'between' as const,
      startTime: startOfDay(day).toISOString(),
      endTime: endOfDay(day).toISOString(),
    });

    // One aggregate per local day: correct in any time zone and on daylight-saving days, and
    // Health Connect removes duplicates between sources itself.
    const perDay = async <T>(type: ReadType, call: (day: string) => Promise<T | undefined>) =>
      read.has(type) ? Promise.all(days.map(async (day) => ({ day, result: await orUndefined(() => call(day), note) }))) : [];

    const [steps, energy, restingHr, weights, sleeps, sessions] = await Promise.all([
      perDay('Steps', (day) => hc.aggregateRecord({ recordType: 'Steps', timeRangeFilter: dayRange(day) })),
      perDay('ActiveCaloriesBurned', (day) => hc.aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter: dayRange(day) })),
      perDay('RestingHeartRate', (day) => hc.aggregateRecord({ recordType: 'RestingHeartRate', timeRangeFilter: dayRange(day) })),
      read.has('Weight') ? orUndefined(() => hc.readRecords('Weight', { timeRangeFilter: range }), note) : undefined,
      read.has('SleepSession')
        ? orUndefined(
            () =>
              hc.readRecords('SleepSession', {
                timeRangeFilter: { ...range, startTime: new Date(startOfDay(from).getTime() - 12 * 3_600_000).toISOString() },
              }),
            note,
          )
        : undefined,
      read.has('ExerciseSession') ? orUndefined(() => hc.readRecords('ExerciseSession', { timeRangeFilter: range }), note) : undefined,
    ]);

    // An aggregate over a day with no records comes back without the value (or as zero with no
    // data origins). Only a day that has at least one contributing source counts as a reading.
    const hasData = (result: { dataOrigins?: string[] } | undefined) => (result?.dataOrigins?.length ?? 0) > 0;

    const raw: RawHealth = {
      steps: steps.flatMap(({ day, result }) => (hasData(result) && result ? [{ day, value: result.COUNT_TOTAL }] : [])),
      activeEnergyKcal: energy.flatMap(({ day, result }) =>
        hasData(result) && result ? [{ day, value: result.ACTIVE_CALORIES_TOTAL?.inKilocalories }] : [],
      ),
      restingHrBpm: restingHr.flatMap(({ day, result }) => (hasData(result) && result ? [{ day, value: result.BPM_AVG }] : [])),
      weightKg: (weights?.records ?? []).map((record) => ({ at: new Date(record.time), value: record.weight.inKilograms })),
      sleep: (sleeps?.records ?? []).flatMap((session) => {
        const stages = session.stages ?? [];
        // A session without stages is all sleep; with stages, only the ones that are sleep count.
        if (stages.length === 0) return [{ start: new Date(session.startTime), end: new Date(session.endTime) }];
        return stages
          .filter((stage) => !AWAKE_STAGES.has(stage.stage))
          .map((stage) => ({ start: new Date(stage.startTime), end: new Date(stage.endTime) }));
      }),
      workouts: (sessions?.records ?? []).map((session) => ({
        start: new Date(session.startTime),
        end: new Date(session.endTime),
        type: EXERCISE_TYPES[session.exerciseType] ?? 'other',
        own: session.metadata?.dataOrigin === appId,
      })),
    };
    return { raw, complete: !failed };
  }

  async function readDaysChecked(from: string, to: string) {
    const options = { from, to, tz: timeZone(), platform: 'android' as const };
    if ((await availability()) !== 'available') return { days: buildHealthDays(EMPTY_RAW_HEALTH, options), complete: false };
    const { read } = await granted();
    const { raw, complete } = await readRaw(from, to, read);
    return { days: buildHealthDays(raw, options), complete };
  }

  return {
    platform: 'android',
    status,

    async connect() {
      const available = await availability();
      if (available !== 'available') return available;
      await orUndefined(() => hc.requestPermission(HEALTH_CONNECT_ACCESS));
      return status();
    },

    async openSettings() {
      try {
        hc.openHealthConnectSettings();
      } catch {
        // Nothing to open on this phone.
      }
    },

    readDaysChecked,

    async readDays(from, to) {
      return (await readDaysChecked(from, to)).days;
    },

    async readProfileHints() {
      const hints: ProfileHints = {};
      if ((await availability()) !== 'available') return hints;
      const { read } = await granted();
      if (!read.has('Weight')) return hints;

      const now = new Date();
      const result = await orUndefined(() =>
        hc.readRecords('Weight', {
          timeRangeFilter: { operator: 'between', startTime: new Date(now.getTime() - 90 * 86_400_000).toISOString(), endTime: now.toISOString() },
          ascendingOrder: false,
          pageSize: 1,
        }),
      );
      const kg = result?.records[0]?.weight.inKilograms;
      if (kg !== undefined && Number.isFinite(kg) && kg > 0) hints.weightKg = Math.round(kg * 10) / 10;
      return hints;
    },

    async writeWorkout(workout: WorkoutToWrite) {
      if ((await availability()) !== 'available') return null;
      const { write } = await granted();
      if (!write.has('ExerciseSession')) return null;

      const startTime = workout.start.toISOString();
      const endTime = workout.end.toISOString();
      const ids = await orUndefined(() =>
        hc.insertRecords([{ recordType: 'ExerciseSession', startTime, endTime, exerciseType: WRITE_EXERCISE[workout.kind], title: workout.title }]),
      );
      const id = ids?.[0];
      if (!id) return null;

      if (write.has('ActiveCaloriesBurned') && workout.energyKcal !== undefined && workout.energyKcal > 0) {
        // Linked to the session by its id, so deleting the workout can remove the energy too.
        await orUndefined(() =>
          hc.insertRecords([
            {
              recordType: 'ActiveCaloriesBurned',
              startTime,
              endTime,
              energy: { value: workout.energyKcal as number, unit: 'kilocalories' },
              metadata: { clientRecordId: `energy-${id}` },
            },
          ]),
        );
      }
      return id;
    },

    async deleteWorkout(recordId) {
      if ((await availability()) !== 'available') return;
      await hc.deleteRecordsByUuids('ExerciseSession', [recordId], []);
      await orUndefined(() => hc.deleteRecordsByUuids('ActiveCaloriesBurned', [], [`energy-${recordId}`]));
    },

    async readRecentSteps(now) {
      if ((await availability()) !== 'available') return null;
      const { read } = await granted();
      if (!read.has('Steps')) return null;
      // A whole day is read so that "no steps this hour" can be told from "no steps recorded at all".
      const groups = await orUndefined(() =>
        hc.aggregateGroupByDuration({
          recordType: 'Steps',
          // The stretches sit on a fixed five-minute grid, so their ends do not shift from one read to the next.
          timeRangeFilter: {
            operator: 'between',
            startTime: new Date(Math.floor((now.getTime() - DAY_MS) / STRETCH_MS) * STRETCH_MS).toISOString(),
            endTime: now.toISOString(),
          },
          timeRangeSlicer: { duration: 'MINUTES', length: 5 },
        }),
      );
      if (!groups) return null;
      const totals = groups.flatMap((group) => {
        const steps = group.result?.COUNT_TOTAL;
        const ends = new Date(group.endTime);
        const end = ends.getTime() > now.getTime() ? now : ends;
        const counted = (group.result?.dataOrigins?.length ?? 0) > 0 && Number.isFinite(steps) && steps > 0 && Number.isFinite(end.getTime());
        return counted ? [{ end, steps }] : [];
      });
      if (totals.length === 0) return null;
      return totals.filter(({ end }) => end.getTime() > now.getTime() - HOUR_MS && end.getTime() <= now.getTime());
    },

    async setBackground(on) {
      // Health Connect only takes a permission back after a restart, so turning off is the
      // app's own state: it simply stops reading in the background.
      if (!on) return true;
      if ((await availability()) !== 'available') return false;
      const has = (permissions: readonly { accessType: string; recordType: string }[] | undefined) =>
        (permissions ?? []).some((p) => p.recordType === BACKGROUND_READ.recordType);
      if (has(await orUndefined(() => hc.getGrantedPermissions()))) return true;
      return has(await orUndefined(() => hc.requestPermission([BACKGROUND_READ])));
    },

    watchSteps() {
      // Health Connect does not deliver changes to a closed app; the periodic task reads instead.
      return () => {};
    },
  };
}
