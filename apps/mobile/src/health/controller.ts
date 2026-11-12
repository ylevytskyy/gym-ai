/**
 * The app's side of connecting to the health store.
 *
 * The system decides what the app may read; the user also decides, inside the app, whether it
 * should read at all. Both have to say yes. Keeping the user's choice here is what makes
 * "disconnect" work: neither platform lets an app give its permissions back reliably
 * (Health Connect only after a restart, HealthKit not at all).
 */

import type { HealthDay } from '@aura-fit/health-core';

import { localDayOf } from './local-day';
import type { CheckedDays, HealthStore, ProfileHints, WorkoutToWrite } from './types';

/**
 * - `off`: available, but the user has not connected or has disconnected in the app.
 * - `denied`: the user was asked and the system reports no access (Android). The request will
 *   not be shown again automatically; the user is pointed to the system settings.
 */
export type HealthState = 'unavailable' | 'needs_update' | 'off' | 'denied' | 'connected';

export interface Preferences {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

const ENABLED = 'health.enabled';
const ASKED = 'health.asked';

export interface HealthController {
  state(): Promise<HealthState>;
  /** Shows the system request if needed and turns reading on when access was given. */
  connect(): Promise<HealthState>;
  /** Stops the app from reading or writing. System access stays until the user removes it there. */
  disconnect(): Promise<HealthState>;
  openSettings(): Promise<void>;
  /** Today's health day, or null when not connected. */
  readToday(now?: Date): Promise<HealthDay | null>;
  readDays(from: string, to: string): Promise<HealthDay[]>;
  /** The days plus whether every read succeeded; `complete` is false when not connected. */
  readDaysChecked(from: string, to: string): Promise<CheckedDays>;
  readProfileHints(): Promise<ProfileHints>;
  writeWorkout(workout: WorkoutToWrite): Promise<string | null>;
  /** Removes a workout this app wrote. Allowed after disconnect too, so the user can still clean up. */
  deleteWorkout(recordId: string): Promise<void>;
}

export function createHealthController(store: HealthStore, preferences: Preferences): HealthController {
  const flag = async (key: string): Promise<boolean> => {
    try {
      return (await preferences.get(key)) === 'true';
    } catch {
      return false;
    }
  };
  const setFlag = async (key: string, value: boolean): Promise<void> => {
    try {
      await preferences.set(key, String(value));
    } catch {
      // The choice is lost on restart; the next launch starts from "off", which is the safe side.
    }
  };

  async function state(): Promise<HealthState> {
    const system = await store.status();
    if (system === 'unavailable' || system === 'needs_update') return system;
    if (system === 'connected') return (await flag(ENABLED)) ? 'connected' : 'off';
    // Not connected. On Android, having asked before means the user said no (or took access
    // away). On iOS it means a new version asks for something new, so asking again is right.
    return store.platform === 'android' && (await flag(ASKED)) ? 'denied' : 'off';
  }

  const connected = async (): Promise<boolean> => (await state()) === 'connected';

  return {
    state,

    async connect() {
      const result = await store.connect();
      await setFlag(ASKED, true);
      await setFlag(ENABLED, result === 'connected');
      return state();
    },

    async disconnect() {
      await setFlag(ENABLED, false);
      return state();
    },

    openSettings: () => store.openSettings(),

    async readToday(now = new Date()) {
      if (!(await connected())) return null;
      const today = localDayOf(now);
      const [day] = await store.readDays(today, today);
      return day ?? null;
    },

    async readDays(from, to) {
      return (await connected()) ? store.readDays(from, to) : [];
    },

    async readDaysChecked(from, to) {
      return (await connected()) ? store.readDaysChecked(from, to) : { days: [], complete: false };
    },

    async readProfileHints() {
      return (await connected()) ? store.readProfileHints() : {};
    },

    async writeWorkout(workout) {
      return (await connected()) ? store.writeWorkout(workout) : null;
    },

    deleteWorkout: (recordId) => store.deleteWorkout(recordId),
  };
}
