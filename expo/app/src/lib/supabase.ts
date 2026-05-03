import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { createClient } from "@supabase/supabase-js";

declare const process:
  | {
      env?: {
        EXPO_PUBLIC_SUPABASE_URL?: string;
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
      };
    }
  | undefined;

const url = process?.env?.EXPO_PUBLIC_SUPABASE_URL?.trim();
const key = process?.env?.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!url || !key) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
  );
}

export const supabase = createClient(url, key, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Pause/resume the refresh loop with the foreground/background lifecycle:
// background JS timers throttle, which can leave the access token expired
// just as the user reopens the app.
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
