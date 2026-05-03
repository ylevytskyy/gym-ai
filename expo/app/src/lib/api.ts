import { Platform } from "react-native";
import { fetch } from "expo/fetch";
import Constants from "expo-constants";

import type { WorkoutPlan } from "@src/types";
import { supabase } from "@src/lib/supabase";

declare const process:
  | {
      env?: {
        EXPO_PUBLIC_APP_ENV?: string;
        EXPO_PUBLIC_API_URL?: string;
      };
    }
  | undefined;

type AppEnvironment = "local" | "development" | "production";

interface ApiErrorBody {
  message?: string | string[];
  error?: string;
}

interface GenerateWorkoutPlanResponse {
  provider: string;
  model: string;
  plan: WorkoutPlan;
}

declare const __DEV__: boolean;

const REQUEST_TIMEOUT_MS = 180_000;

const apiUrls: Record<AppEnvironment, string | undefined> = {
  local: undefined,
  development: undefined,
  production: undefined,
};

function envValue(name: "EXPO_PUBLIC_APP_ENV" | "EXPO_PUBLIC_API_URL") {
  if (typeof process === "undefined" || !process.env) return undefined;
  
  if (name === "EXPO_PUBLIC_APP_ENV") {
    const val = process.env.EXPO_PUBLIC_APP_ENV;
    return val ? val.trim() : undefined;
  }
  if (name === "EXPO_PUBLIC_API_URL") {
    const val = process.env.EXPO_PUBLIC_API_URL;
    return val ? val.trim() : undefined;
  }
  return undefined;
}

function appEnvironment(): AppEnvironment {
  const configured = envValue("EXPO_PUBLIC_APP_ENV");

  if (
    configured === "local" ||
    configured === "development" ||
    configured === "production"
  ) {
    return configured;
  }

  return "local";
}

function normalizeApiUrl(url: string): string {
  return url.replace(/\/$/, "");
}

function localApiBaseUrl(): string {
  const configured = envValue("EXPO_PUBLIC_API_URL");

  if (configured) {
    return normalizeApiUrl(configured);
  }

  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(":")[0];
  if (host) {
    return `http://${host}:3000/api`;
  }

  if (Platform.OS === "android") {
    return "http://10.0.2.2:3000/api";
  }

  return "http://localhost:3000/api";
}

export function apiBaseUrl(): string {
  const environment = appEnvironment();
  const configured = envValue("EXPO_PUBLIC_API_URL");

  if (configured) {
    return normalizeApiUrl(configured);
  }

  if (environment === "local") {
    return apiUrls.local ?? localApiBaseUrl();
  }

  const apiUrl = apiUrls[environment];
  if (apiUrl) {
    return normalizeApiUrl(apiUrl);
  }

  throw new Error(
    `No API URL configured for the ${environment} mobile environment.`,
  );
}

function errorMessage(body: ApiErrorBody, status: number): string {
  if (Array.isArray(body.message)) {
    return body.message.join("\n");
  }

  return body.message ?? body.error ?? `Request failed with status ${status}.`;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("You are signed out. Sign in to continue.");
  }
  return { Authorization: `Bearer ${token}` };
}

export async function generateWorkoutPlan(
  prompt: string,
): Promise<GenerateWorkoutPlanResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const url = `${apiBaseUrl()}/llm/workout-plan`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await authHeader()),
      },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });

    const body = (await response.json().catch(() => ({}))) as
      | GenerateWorkoutPlanResponse
      | ApiErrorBody;

    if (!response.ok) {
      if (__DEV__) console.error(`[API] Request failed (${response.status}):`, body);
      throw new Error(errorMessage(body as ApiErrorBody, response.status));
    }

    return body as GenerateWorkoutPlanResponse;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Plan generation timed out. Try again.");
    }

    if (__DEV__) console.error("[API] Request error:", error);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
