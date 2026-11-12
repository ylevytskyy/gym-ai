import AsyncStorage from '@react-native-async-storage/async-storage';

import { createHealthController } from '@/health/controller';
import { localDayOf } from '@/health/local-day';
import { healthStore } from '@/health/store';
import { getSupabase } from '@/lib/supabase';
import type { Services } from '@/services';

export function createRealServices(): Services {
  return {
    supabase: getSupabase(),
    health: createHealthController(healthStore, {
      get: (key) => AsyncStorage.getItem(key),
      set: (key, value) => AsyncStorage.setItem(key, value),
    }),
    today: () => localDayOf(new Date()),
  };
}
