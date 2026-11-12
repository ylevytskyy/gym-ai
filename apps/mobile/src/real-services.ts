import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import { createHealthController } from '@/health/controller';
import { localDayOf } from '@/health/local-day';
import { healthStore } from '@/health/store';
import { readEnv } from '@/lib/env';
import { getSupabase } from '@/lib/supabase';
import type { Services } from '@/services';

export function createRealServices(): Services {
  const env = readEnv();
  return {
    supabase: getSupabase(),
    health: createHealthController(healthStore, {
      get: (key) => AsyncStorage.getItem(key),
      set: (key, value) => AsyncStorage.setItem(key, value),
    }),
    today: () => localDayOf(new Date()),
    assistantUrl: env.assistantUrl,
    fetch: (input, init) => fetch(input, init),
    mediaUrl: (file) => `${env.supabaseUrl}/storage/v1/object/public/exercise-media/${encodeURIComponent(file)}`,
    newId: () => Crypto.randomUUID(),
  };
}
