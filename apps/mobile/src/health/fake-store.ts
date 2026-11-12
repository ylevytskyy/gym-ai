/**
 * An in-memory HealthStore for tests. It behaves like a real store at the interface: nothing
 * can be read before connecting, a denied request stays not connected, and written workouts
 * come back as the app's own (so they are not external workouts).
 */

import { buildHealthDays } from './build-health-days';
import {
  EMPTY_RAW_HEALTH,
  type HealthStatus,
  type HealthStore,
  type ProfileHints,
  type RawHealth,
  type WorkoutToWrite,
} from './types';

export interface FakeHealthOptions {
  platform?: 'ios' | 'android';
  /** Status before connect() is called. */
  initial?: HealthStatus;
  /** What the user answers to the permission request. */
  grants?: boolean;
  canWrite?: boolean;
  raw?: RawHealth;
  hints?: ProfileHints;
  tz?: string;
}

export interface FakeHealthStore extends HealthStore {
  readonly written: (WorkoutToWrite & { id: string })[];
  connectCalls: number;
  settingsOpened: number;
}

export function createFakeHealthStore(options: FakeHealthOptions = {}): FakeHealthStore {
  const platform = options.platform ?? 'ios';
  let current: HealthStatus = options.initial ?? 'not_connected';
  let nextId = 1;

  const store: FakeHealthStore = {
    platform,
    written: [],
    connectCalls: 0,
    settingsOpened: 0,

    async status() {
      return current;
    },

    async connect() {
      store.connectCalls += 1;
      if (current === 'not_connected' && (options.grants ?? true)) current = 'connected';
      return current;
    },

    async openSettings() {
      store.settingsOpened += 1;
    },

    async readDays(from, to) {
      const raw = current === 'connected' ? (options.raw ?? EMPTY_RAW_HEALTH) : EMPTY_RAW_HEALTH;
      const own = store.written.map((w) => ({ start: w.start, end: w.end, type: 'strength' as const, own: true }));
      return buildHealthDays({ ...raw, workouts: [...raw.workouts, ...own] }, { from, to, tz: options.tz ?? 'Europe/Kyiv', platform });
    },

    async readProfileHints() {
      return current === 'connected' ? { ...(options.hints ?? {}) } : {};
    },

    async writeWorkout(workout) {
      if (current !== 'connected' || options.canWrite === false) return null;
      const id = `fake-${nextId++}`;
      store.written.push({ ...workout, id });
      return id;
    },

    async deleteWorkout(recordId) {
      const index = store.written.findIndex((w) => w.id === recordId);
      if (index >= 0) store.written.splice(index, 1);
    },
  };
  return store;
}
