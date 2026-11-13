import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import { createHealthController } from '@/health/controller';
import { deviceTimeZone, localDayOf } from '@/health/local-day';
import { healthStore } from '@/health/store';
import { readEnv } from '@/lib/env';
import { getSupabase } from '@/lib/supabase';
import { createNudgeController } from '@/nudges/controller';
import { createExpoNotifier } from '@/nudges/expo-notifier';
import type { Services } from '@/services';

export function createRealServices(): Services {
  const env = readEnv();
  const preferences = {
    get: (key: string) => AsyncStorage.getItem(key),
    set: (key: string, value: string) => AsyncStorage.setItem(key, value),
  };
  const health = createHealthController(healthStore, preferences);
  const notifier = createExpoNotifier();
  return {
    supabase: getSupabase(),
    health,
    nudges: createNudgeController({ health, notifier, preferences, now: () => new Date(), timeZone: deviceTimeZone }),
    notifier,
    today: () => localDayOf(new Date()),
    assistantUrl: env.assistantUrl,
    fetch: (input, init) => fetch(input, init),
    mediaUrl: (file) => `${env.supabaseUrl}/storage/v1/object/public/exercise-media/${encodeURIComponent(file)}`,
    newId: () => Crypto.randomUUID(),
  };
}

let shared: Services | undefined;

/** The one set of services of the running app, shared by the screens and the background task. */
export function getRealServices(): Services {
  shared ??= createRealServices();
  return shared;
}
