import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

import { readEnv } from './env';
import { createSecureSessionStorage } from './secure-storage';

let client: SupabaseClient | undefined;

/** The app's Supabase client. It holds only the publishable key; Row Level Security protects the data. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const env = readEnv();
    client = createClient(env.supabaseUrl, env.supabasePublishableKey, {
      auth: {
        storage: createSecureSessionStorage(SecureStore),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
