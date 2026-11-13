/** The health store of this platform. Metro picks store.ios.ts or store.android.ts on a phone. */

import { buildHealthDays } from './build-health-days';
import { deviceTimeZone } from './local-day';
import { EMPTY_RAW_HEALTH, type HealthStore } from './types';

/** Used where there is no health store at all (web, tests that do not inject one). */
export const healthStore: HealthStore = {
  platform: 'ios',
  status: async () => 'unavailable',
  connect: async () => 'unavailable',
  openSettings: async () => {},
  readDays: async (from, to) => buildHealthDays(EMPTY_RAW_HEALTH, { from, to, tz: deviceTimeZone(), platform: 'ios' }),
  readDaysChecked: async (from, to) => ({ days: buildHealthDays(EMPTY_RAW_HEALTH, { from, to, tz: deviceTimeZone(), platform: 'ios' }), complete: false }),
  readProfileHints: async () => ({}),
  writeWorkout: async () => null,
  deleteWorkout: async () => {},
  readRecentSteps: async () => null,
  setBackground: async (on) => !on,
  watchSteps: () => () => {},
};
