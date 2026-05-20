# i18n & Ukrainian Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce i18next-based internationalization to the Expo/React Native fitness app, add Ukrainian as a second language, and move all exercise text out of the structural catalog into locale dictionaries.

**Architecture:** `i18next` + `react-i18next` with three namespaces (`common`, `enums`, `exercises`). Device locale auto-detection via `expo-localization`, with a manual override in Settings. Exercise text split out of `exercises.json` into `locales/<lang>/exercises.json` at the project root; a prompt-time merger keeps the LLM prompt contract unchanged. A build-time validator blocks drift between English and Ukrainian locale files.

**Tech Stack:** Expo SDK 54, React Native 0.81, TypeScript 5.9, Zustand, i18next ^23, react-i18next ^14, expo-localization ~16.

**Related spec:** `docs/superpowers/specs/2026-04-09-i18n-ukrainian-design.md`

**Verification approach:** No test framework exists in this project. Each task uses `npm run typecheck` as its correctness signal, plus `npm run validate-locales` once the validator script is in place. A final manual smoke test exercises both languages end-to-end.

---

## File Structure

**New files:**
- `app/src/i18n/index.ts` — i18next initialization, `SupportedLanguage` type, `initI18n()`, `resolveLanguage()`, exports `i18n`
- `app/src/i18n/types.ts` — `ExerciseText` interface
- `app/src/i18n/locales/en/common.json` — UI strings (English)
- `app/src/i18n/locales/en/enums.json` — enum labels (English)
- `app/src/i18n/locales/en/exercises.json` — per-exercise text (English, mirrored from project root by sync-data)
- `app/src/i18n/locales/uk/common.json` — UI strings (Ukrainian)
- `app/src/i18n/locales/uk/enums.json` — enum labels (Ukrainian)
- `app/src/i18n/locales/uk/exercises.json` — per-exercise text (Ukrainian, mirrored from project root)
- `locales/en/exercises.json` (**project root**) — source of truth for English exercise text
- `locales/uk/exercises.json` (**project root**) — source of truth for Ukrainian exercise text
- `app/scripts/extract-exercise-text.ts` — one-shot tool to split the original `exercises.json` into structural + `locales/en/exercises.json`. Run once, then can be deleted or retained as a migration record.
- `app/scripts/validate-locales.ts` — build-time drift checker, runs in `prestart`

**Modified files:**
- `app/package.json` — add dependencies and scripts
- `app/app/_layout.tsx` — initialize i18n with splash gate
- `app/src/types/enums.ts` — delete `*_LABELS` exports
- `app/src/types/catalog.ts` — drop text fields from `Exercise` interface
- `app/src/lib/catalog.ts` — add `exerciseText()` helper
- `app/src/lib/prompt.ts` — merge structural catalog + English exercise text before substitution
- `app/src/lib/runner.ts` — read instructions/mistakes/name via `exerciseText()`
- `app/src/lib/scheduler.ts` — build notification bodies via `i18n.t()`
- `app/src/store/settingsStore.ts` — add `language` field and `setLanguage()` action
- `app/scripts/sync-data.sh` — also mirror `locales/*/exercises.json` from project root
- `app/app/(tabs)/_layout.tsx` — localize tab titles
- `app/app/(tabs)/index.tsx` — localize dashboard strings
- `app/app/(tabs)/settings.tsx` — localize all strings, add language switcher
- `app/app/onboarding/welcome.tsx` — localize
- `app/app/onboarding/name.tsx` — localize
- `app/app/onboarding/photo.tsx` — localize
- `app/app/onboarding/dob.tsx` — localize
- `app/app/onboarding/body.tsx` — localize
- `app/app/onboarding/fitness-level.tsx` — localize
- `app/app/onboarding/goals.tsx` — localize
- `app/app/plan/generate.tsx` — localize
- `app/app/plan/paste.tsx` — localize
- `app/app/plan/preview/[sessionId].tsx` — localize, use `exerciseText()`
- `app/app/workout/[sessionId].tsx` — localize, use `exerciseText()`
- `app/app/profile/edit.tsx` — localize
- `app/src/components/SessionCard.tsx` — localize
- `app/src/components/UpNextCard.tsx` — localize
- `app/src/components/DayStrip.tsx` — localize "Rest"/"TODAY"
- `app/src/components/WizardFooter.tsx` — localize "Continue"/"Skip"/"Back"/step copy
- **Project root** `exercises.json` — strip six text fields (`name`, `instructions`, `common_mistakes`, `modifications`, `contraindications`, `notes`); retain everything else (wait: `contraindications` is enum-keyed and stays in the structural catalog — only five fields are actually removed)

Note: the original spec listed `contraindications` among removed fields. After implementation review, `contraindications` is a list of enum literals (e.g., `"neck_injury"`, `"vertigo"`) and must stay in the structural `exercises.json` so the LLM can filter against `profile.limitations`. It is rendered via `t('enums:contraindications.<key>')`. So the fields actually stripped from `exercises.json` are: **`name`, `instructions`, `common_mistakes`, `modifications`, `notes`** — five fields.

---

## Task 1: Install dependencies

**Files:**
- Modify: `app/package.json`

- [ ] **Step 1: Install i18next, react-i18next, and expo-localization**

From `/Users/lion/Documents/Projects/mine/fitness/app`, run:

```bash
npx expo install expo-localization
npm install i18next react-i18next
```

Expected: `package.json` gains `"expo-localization": "~16.x.x"`, `"i18next": "^23.x.x"`, `"react-i18next": "^14.x.x"`. `package-lock.json` and `yarn.lock` update.

- [ ] **Step 2: Verify typecheck still passes**

```bash
npm run typecheck
```

Expected: no errors. (Installing libraries does not affect existing code.)

- [ ] **Step 3: Commit**

```bash
git add app/package.json app/package-lock.json app/yarn.lock
git commit -m "feat(i18n): install i18next, react-i18next, expo-localization"
```

---

## Task 2: Create i18n scaffolding with stub locale files

**Files:**
- Create: `app/src/i18n/index.ts`
- Create: `app/src/i18n/types.ts`
- Create: `app/src/i18n/locales/en/common.json`
- Create: `app/src/i18n/locales/en/enums.json`
- Create: `app/src/i18n/locales/en/exercises.json`
- Create: `app/src/i18n/locales/uk/common.json`
- Create: `app/src/i18n/locales/uk/enums.json`
- Create: `app/src/i18n/locales/uk/exercises.json`

- [ ] **Step 1: Create `app/src/i18n/types.ts`**

```ts
// Shape returned by exerciseText(id) — keep in sync with the structure stored
// in app/src/i18n/locales/<lang>/exercises.json.

export interface ExerciseText {
  name: string;
  instructions: string[];
  common_mistakes: string[];
  modifications: { easier: string; harder: string };
  notes: string | null;
}
```

- [ ] **Step 2: Create `app/src/i18n/index.ts`**

```ts
// Single entry point for i18n. initI18n() must be called once before any
// React rendering (from app/_layout.tsx). After initialization, components
// use `useTranslation()` and non-React code imports `i18n` directly.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import enCommon from './locales/en/common.json';
import enEnums from './locales/en/enums.json';
import enEx from './locales/en/exercises.json';
import ukCommon from './locales/uk/common.json';
import ukEnums from './locales/uk/enums.json';
import ukEx from './locales/uk/exercises.json';

export const SUPPORTED_LANGUAGES = ['en', 'uk'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type LanguagePref = 'system' | SupportedLanguage;

export function resolveLanguage(pref: LanguagePref): SupportedLanguage {
  if (pref !== 'system') return pref;
  const device = Localization.getLocales()[0]?.languageCode ?? 'en';
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(device)
    ? (device as SupportedLanguage)
    : 'en';
}

export async function initI18n(pref: LanguagePref): Promise<typeof i18n> {
  if (i18n.isInitialized) {
    await i18n.changeLanguage(resolveLanguage(pref));
    return i18n;
  }
  await i18n.use(initReactI18next).init({
    lng: resolveLanguage(pref),
    fallbackLng: 'en',
    ns: ['common', 'enums', 'exercises'],
    defaultNS: 'common',
    resources: {
      en: { common: enCommon, enums: enEnums, exercises: enEx },
      uk: { common: ukCommon, enums: ukEnums, exercises: ukEx },
    },
    interpolation: { escapeValue: false }, // RN renders text, not HTML
    returnNull: false,
    compatibilityJSON: 'v4', // CLDR plural rules (required for Ukrainian one/few/many)
  });
  return i18n;
}

export { i18n };
```

- [ ] **Step 3: Create stub locale files**

Create each of the six JSON files as an empty object `{}`:

```bash
mkdir -p app/src/i18n/locales/en app/src/i18n/locales/uk
printf '{}\n' > app/src/i18n/locales/en/common.json
printf '{}\n' > app/src/i18n/locales/en/enums.json
printf '{}\n' > app/src/i18n/locales/en/exercises.json
printf '{}\n' > app/src/i18n/locales/uk/common.json
printf '{}\n' > app/src/i18n/locales/uk/enums.json
printf '{}\n' > app/src/i18n/locales/uk/exercises.json
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS. The new files compile cleanly; nothing consumes them yet.

- [ ] **Step 5: Commit**

```bash
git add app/src/i18n app/src/i18n/locales
git commit -m "feat(i18n): add i18n scaffolding with stub locale files"
```

---

## Task 3: Wire initI18n into _layout.tsx

**Files:**
- Modify: `app/app/_layout.tsx`

- [ ] **Step 1: Gate the root stack on i18n initialization**

Replace `app/app/_layout.tsx` with the following. The two material changes are (a) calling `initI18n()` on mount and (b) gating `<Stack>` on an `i18nReady` state:

```tsx
import "react-native-get-random-values"; // must be first (for uuid)
import React, { useEffect, useRef, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Stack, router, useRootNavigationState } from "expo-router";
import * as Notifications from "expo-notifications";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ThemeProvider, useTheme } from "@src/theme/ThemeProvider";
import { initScheduler } from "@src/lib/scheduler";
import { initI18n } from "@src/i18n";
import { useSettingsStore } from "@src/store/settingsStore";

// Handles both: (1) app was backgrounded and user tapped notification,
// and (2) app was cold-started by notification tap. We gate the
// navigation on `useRootNavigationState().key` so we never call
// router.push() before the root <Stack> has mounted.
function useNotificationDeepLink() {
  const navState = useRootNavigationState();
  const ready = !!navState?.key;
  const pendingSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const enqueue = (
      response: Notifications.NotificationResponse | null | undefined,
    ) => {
      if (!response || !mounted) return;
      const data = response.notification.request.content.data as
        | { sessionId?: string }
        | undefined;
      if (data?.sessionId) {
        pendingSessionIdRef.current = data.sessionId;
      }
    };

    Notifications.getLastNotificationResponseAsync()
      .then(enqueue)
      .catch(() => {});

    const sub = Notifications.addNotificationResponseReceivedListener(enqueue);

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const id = pendingSessionIdRef.current;
    if (id) {
      pendingSessionIdRef.current = null;
      router.push(`/plan/preview/${id}`);
    }
  }, [ready]);
}

function Splash() {
  // Renders inside ThemeProvider so we can use theme colors on the loader.
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ActivityIndicator color={theme.colors.primary} />
    </View>
  );
}

export default function RootLayout() {
  useNotificationDeepLink();
  const languagePref = useSettingsStore((s) => s.language);
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    initI18n(languagePref)
      .then(() => setI18nReady(true))
      .catch(() => setI18nReady(true)); // fail-open: worst case, keys render
    // languagePref is read once at mount; subsequent changes are handled by
    // settingsStore.setLanguage -> i18n.changeLanguage directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    initScheduler().catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        {i18nReady ? (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: "transparent" },
            }}
          />
        ) : (
          <Splash />
        )}
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
```

Note: this references `settingsStore.language`, which is added in Task 11. For now, add a temporary default so this compiles. Proceed to Step 2 before running typecheck.

- [ ] **Step 2: Add a temporary `language` field to settingsStore**

Edit `app/src/store/settingsStore.ts`. Add the field and setter; full wiring (with i18n.changeLanguage + rescheduleAll) comes in Task 11.

```ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemePreference = "system" | "light" | "dark";
export type LanguagePref = "system" | "en" | "uk";

interface SettingsState {
  theme: ThemePreference;
  language: LanguagePref;
  notificationsEnabled: boolean;
  hapticsEnabled: boolean;
  audioEnabled: boolean;
  keepAwakeEnabled: boolean;
  postponeMinutes: number;

  setTheme: (t: ThemePreference) => void;
  setLanguage: (l: LanguagePref) => void;
  setNotificationsEnabled: (v: boolean) => void;
  setHapticsEnabled: (v: boolean) => void;
  setAudioEnabled: (v: boolean) => void;
  setKeepAwakeEnabled: (v: boolean) => void;
  setPostponeMinutes: (m: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "system",
      language: "system",
      notificationsEnabled: true,
      hapticsEnabled: true,
      audioEnabled: true,
      keepAwakeEnabled: true,
      postponeMinutes: 15,

      setTheme: (t) => set({ theme: t }),
      setLanguage: (l) => set({ language: l }),
      setNotificationsEnabled: (v) => set({ notificationsEnabled: v }),
      setHapticsEnabled: (v) => set({ hapticsEnabled: v }),
      setAudioEnabled: (v) => set({ audioEnabled: v }),
      setKeepAwakeEnabled: (v) => set({ keepAwakeEnabled: v }),
      setPostponeMinutes: (m) => set({ postponeMinutes: m }),
    }),
    {
      name: "fitness.settings",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/app/_layout.tsx app/src/store/settingsStore.ts
git commit -m "feat(i18n): initialize i18n on mount with splash gate"
```

---

## Task 4: Populate English enums.json and delete *_LABELS constants

**Files:**
- Modify: `app/src/i18n/locales/en/enums.json`
- Modify: `app/src/types/enums.ts`

- [ ] **Step 1: Populate `app/src/i18n/locales/en/enums.json`**

Replace the empty `{}` with:

```json
{
  "goals": {
    "belly_fat": "Lose belly fat",
    "weight_loss": "Weight loss",
    "posture": "Better posture",
    "core_strength": "Core strength",
    "cardiovascular_health": "Cardio health",
    "flexibility": "Flexibility",
    "general_fitness": "General fitness",
    "muscle_tone": "Muscle tone",
    "stress_relief": "Stress relief"
  },
  "limitations": {
    "none": "None",
    "lower_back_pain": "Lower back pain",
    "lower_back_injury": "Lower back injury",
    "knee_pain": "Knee pain",
    "knee_injury": "Knee injury",
    "wrist_pain": "Wrist pain",
    "wrist_injury": "Wrist injury",
    "shoulder_pain": "Shoulder pain",
    "shoulder_injury": "Shoulder injury",
    "neck_injury": "Neck injury",
    "elbow_injury": "Elbow injury",
    "ankle_injury": "Ankle injury",
    "hip_injury": "Hip injury",
    "high_blood_pressure": "High blood pressure",
    "balance_issues": "Balance issues",
    "vertigo": "Vertigo",
    "pregnancy_late_term": "Late-term pregnancy"
  },
  "fitnessLevels": {
    "beginner": "Beginner",
    "intermediate": "Intermediate",
    "advanced": "Advanced"
  },
  "fitnessLevelDescriptions": {
    "beginner": "New to exercise, or returning after a long break.",
    "intermediate": "Exercise a few times a week and know the basics.",
    "advanced": "Regular, structured training; confident with form."
  },
  "meetingDensity": {
    "low": "Low — few meetings, long focus blocks",
    "medium": "Medium — typical calendar",
    "high": "High — back-to-back meetings"
  },
  "sessionTypes": {
    "main_workout": "Main workout",
    "desk_break": "Desk break",
    "stair_cardio": "Stair cardio",
    "stretching": "Stretching"
  },
  "priorities": {
    "required": "Required",
    "preferred": "Preferred",
    "optional": "Optional"
  },
  "intensities": {
    "low": "Low",
    "medium": "Medium",
    "high": "High"
  },
  "blockTypes": {
    "warmup": "Warmup",
    "main": "Main",
    "cooldown": "Cooldown",
    "circuit": "Circuit"
  },
  "periodTypes": {
    "weekly": "Weekly",
    "monthly": "Monthly",
    "custom": "Custom"
  },
  "bodyParts": {
    "neck": "Neck",
    "shoulders": "Shoulders",
    "upper_back": "Upper back",
    "lower_back": "Lower back",
    "obliques": "Obliques",
    "core": "Core",
    "chest": "Chest",
    "arms": "Arms",
    "legs": "Legs",
    "glutes": "Glutes",
    "hips": "Hips",
    "full_body": "Full body"
  },
  "contraindications": {
    "lower_back_injury": "Lower back injury",
    "lower_back_pain": "Lower back pain",
    "knee_injury": "Knee injury",
    "knee_pain": "Knee pain",
    "wrist_injury": "Wrist injury",
    "wrist_pain": "Wrist pain",
    "shoulder_injury": "Shoulder injury",
    "shoulder_pain": "Shoulder pain",
    "neck_injury": "Neck injury",
    "elbow_injury": "Elbow injury",
    "ankle_injury": "Ankle injury",
    "hip_injury": "Hip injury",
    "high_blood_pressure": "High blood pressure",
    "balance_issues": "Balance issues",
    "vertigo": "Vertigo",
    "pregnancy_late_term": "Late-term pregnancy"
  }
}
```

Note: the `bodyParts` and `contraindications` lists above cover the values currently used across `exercises.json`. If you find an exercise with a `body_parts` value not listed here (e.g., `"calves"`, `"forearms"`), add an entry in this file and mirror it to Ukrainian in Task 13.

- [ ] **Step 2: Delete `*_LABELS` constants from `app/src/types/enums.ts`**

Remove everything from `// Human labels for the UI.` (line 113) through the end of the file. After editing, the file should end at:

```ts
export type NoiseLevel = "silent" | "quiet" | "moderate";
export type DefaultUnit = Unit;
```

Do **not** delete the enum type exports or the `ALL_*` arrays — only the `*_LABELS` records.

- [ ] **Step 3: Run typecheck to find consumers**

```bash
npm run typecheck
```

Expected: FAIL with errors pointing at every file that imports the deleted constants. Expected affected files:
- `app/src/lib/scheduler.ts` (imports `SESSION_TYPE_LABELS`)
- `app/src/components/SessionCard.tsx` (imports `PRIORITY_LABELS`, `SESSION_TYPE_LABELS`)
- `app/src/components/UpNextCard.tsx` (imports `SESSION_TYPE_LABELS`)
- `app/app/plan/preview/[sessionId].tsx` (imports `PRIORITY_LABELS`, `SESSION_TYPE_LABELS`)
- `app/app/plan/generate.tsx` (imports `LIMITATION_LABELS`, `MEETING_DENSITY_LABELS`)
- `app/app/profile/edit.tsx` (imports `FITNESS_LEVEL_LABELS`, `GOAL_LABELS`)
- `app/app/onboarding/goals.tsx` (imports `GOAL_LABELS`)
- `app/app/onboarding/fitness-level.tsx` (imports `FITNESS_LEVEL_LABELS`)
- `app/src/types/index.ts` (re-exports these if present — check)

Keep this error list open; subsequent tasks fix these files.

- [ ] **Step 4: Fix `src/types/index.ts` re-exports if present**

Open `app/src/types/index.ts` and remove any re-exports of the deleted `*_LABELS` constants. If the file re-exports from `./enums`, it already only re-exports what exists, so no change is needed.

- [ ] **Step 5: Fix `src/lib/scheduler.ts`**

Edit `app/src/lib/scheduler.ts`:

Replace:
```ts
import { SESSION_TYPE_LABELS } from "@src/types";
```
with:
```ts
import { i18n } from "@src/i18n";
```

Replace lines 84-86 (inside `scheduleOne`):
```ts
const typeLabel = SESSION_TYPE_LABELS[session.type];
const kcal = Math.round(session.estimated_calories_total);
const body = `${session.duration_minutes} min · ~${kcal} kcal · window closes ${session.time_window.latest}`;
```
with:
```ts
const typeLabel = i18n.t(`enums:sessionTypes.${session.type}`);
const kcal = Math.round(session.estimated_calories_total);
const body = i18n.t('notifications.body', {
  duration: session.duration_minutes,
  kcal,
  windowClose: session.time_window.latest,
});
```

Replace the `title:` line inside `scheduleNotificationAsync` (currently ``title: `Time for your ${typeLabel.toLowerCase()}` ``) with:
```ts
title: i18n.t('notifications.title', { sessionType: typeLabel }),
```

- [ ] **Step 6: Fix `src/components/SessionCard.tsx`**

Edit `app/src/components/SessionCard.tsx`:

Replace:
```ts
import { PRIORITY_LABELS, SESSION_TYPE_LABELS } from "@src/types";
```
with:
```ts
import { useTranslation } from "react-i18next";
```

Inside `SessionCard` function, after `const theme = useTheme();`, add:
```ts
const { t } = useTranslation();
```

Replace `{SESSION_TYPE_LABELS[session.type]}` with `{t(`enums:sessionTypes.${session.type}`)}`.

Replace `{PRIORITY_LABELS[session.priority]}` with `{t(`enums:priorities.${session.priority}`)}`.

- [ ] **Step 7: Fix `src/components/UpNextCard.tsx`**

Edit `app/src/components/UpNextCard.tsx`:

Replace:
```ts
import { SESSION_TYPE_LABELS } from "@src/types";
```
with:
```ts
import { useTranslation } from "react-i18next";
```

Inside `UpNextCard`, after `const theme = useTheme();`, add:
```ts
const { t } = useTranslation();
```

Replace `{SESSION_TYPE_LABELS[session.type]}` with `{t(`enums:sessionTypes.${session.type}`)}`.

- [ ] **Step 8: Fix `app/plan/preview/[sessionId].tsx`**

Edit `app/app/plan/preview/[sessionId].tsx`:

Replace the import:
```ts
import {
  PRIORITY_LABELS,
  SESSION_TYPE_LABELS,
  type PlannedExercise,
} from "@src/types";
```
with:
```ts
import { type PlannedExercise } from "@src/types";
import { useTranslation } from "react-i18next";
```

Inside `SessionPreview`, after `const theme = useTheme();`, add:
```ts
const { t } = useTranslation();
```

Replace `{SESSION_TYPE_LABELS[session.type]}` with `{t(`enums:sessionTypes.${session.type}`)}`.

Replace `{PRIORITY_LABELS[session.priority].toUpperCase()}` with `{t(`enums:priorities.${session.priority}`).toUpperCase()}`.

- [ ] **Step 9: Fix `app/plan/generate.tsx`**

Edit `app/app/plan/generate.tsx`:

Replace the import that includes the label consts:
```ts
import {
  ALL_LIMITATIONS,
  ALL_MEETING_DENSITIES,
  LIMITATION_LABELS,
  MEETING_DENSITY_LABELS,
  type Limitation,
  type MeetingDensity,
  type PeriodType,
} from "@src/types";
```
with:
```ts
import {
  ALL_LIMITATIONS,
  ALL_MEETING_DENSITIES,
  type Limitation,
  type MeetingDensity,
  type PeriodType,
} from "@src/types";
import { useTranslation } from "react-i18next";
```

Inside `GeneratePlan`, add `const { t } = useTranslation();` after `const theme = useTheme();`.

Replace `label={MEETING_DENSITY_LABELS[d]}` with `label={t(`enums:meetingDensity.${d}`)}`.
Replace `label={LIMITATION_LABELS[l]}` with `label={t(`enums:limitations.${l}`)}`.

- [ ] **Step 10: Fix `app/profile/edit.tsx`**

Edit `app/app/profile/edit.tsx`:

Replace:
```ts
import {
  ALL_FITNESS_LEVELS,
  ALL_GOALS,
  FITNESS_LEVEL_LABELS,
  GOAL_LABELS,
  type FitnessLevel,
  type Goal,
} from "@src/types";
```
with:
```ts
import {
  ALL_FITNESS_LEVELS,
  ALL_GOALS,
  type FitnessLevel,
  type Goal,
} from "@src/types";
import { useTranslation } from "react-i18next";
```

Inside `ProfileEdit`, add `const { t } = useTranslation();` after `const theme = useTheme();`.

Replace `label={FITNESS_LEVEL_LABELS[f]}` with `label={t(`enums:fitnessLevels.${f}`)}`.
Replace `label={GOAL_LABELS[g]}` with `label={t(`enums:goals.${g}`)}`.

- [ ] **Step 11: Fix `app/onboarding/goals.tsx`**

Edit `app/app/onboarding/goals.tsx`:

Replace:
```ts
import { ALL_GOALS, GOAL_LABELS, type Goal } from "@src/types";
```
with:
```ts
import { ALL_GOALS, type Goal } from "@src/types";
import { useTranslation } from "react-i18next";
```

Inside `GoalsStep`, add `const { t } = useTranslation();` after `const theme = useTheme();`.

Replace `label={GOAL_LABELS[goal]}` with `label={t(`enums:goals.${goal}`)}`.

- [ ] **Step 12: Fix `app/onboarding/fitness-level.tsx`**

Edit `app/app/onboarding/fitness-level.tsx`:

Replace:
```ts
import { ALL_FITNESS_LEVELS, FITNESS_LEVEL_LABELS } from "@src/types";
```
with:
```ts
import { ALL_FITNESS_LEVELS } from "@src/types";
import { useTranslation } from "react-i18next";
```

Delete the local `DESCRIPTIONS` constant (lines 13-17) — descriptions move into enums.json.

Inside `FitnessLevelStep`, add `const { t } = useTranslation();` after `const theme = useTheme();`.

Replace `{FITNESS_LEVEL_LABELS[level]}` with `{t(`enums:fitnessLevels.${level}`)}`.
Replace `{DESCRIPTIONS[level]}` with `{t(`enums:fitnessLevelDescriptions.${level}`)}`.

- [ ] **Step 13: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS. Every consumer of the deleted constants now reads from i18next.

- [ ] **Step 14: Commit**

```bash
git add app/src/i18n/locales/en/enums.json app/src/types/enums.ts app/src/lib/scheduler.ts app/src/components/SessionCard.tsx app/src/components/UpNextCard.tsx app/app/plan/preview/ app/app/plan/generate.tsx app/app/profile/edit.tsx app/app/onboarding/goals.tsx app/app/onboarding/fitness-level.tsx
git commit -m "feat(i18n): migrate enum labels to enums namespace"
```

---

## Task 5: Populate English common.json

**Files:**
- Modify: `app/src/i18n/locales/en/common.json`

- [ ] **Step 1: Populate `app/src/i18n/locales/en/common.json`**

Replace the empty `{}` with:

```json
{
  "app": {
    "loading": "Loading…",
    "notFound": "Not found"
  },
  "tabs": {
    "plan": "Plan",
    "settings": "Settings"
  },
  "wizard": {
    "continue": "Continue",
    "back": "← Back",
    "skip": "Skip",
    "stepOf": "Step {{current}} of {{total}}"
  },
  "onboarding": {
    "welcome": {
      "title": "Welcome to Fitness",
      "subtitle": "Home workouts built around your workday.\nNo equipment. Reminds you to move. Survives meetings.",
      "cta": "Get started"
    },
    "name": {
      "title": "What should I call you?",
      "subtitle": "Just a first name is fine — shown in greetings.",
      "placeholder": "Your name"
    },
    "photo": {
      "title": "Add a profile photo?",
      "subtitle": "Optional. Shown on the dashboard.",
      "choose": "Choose from library",
      "replace": "Replace photo",
      "remove": "Remove",
      "pickError": "Couldn't pick photo"
    },
    "dob": {
      "title": "When were you born?",
      "subtitle": "Used to age-adjust exercise selection and targets."
    },
    "body": {
      "title": "A few body measurements",
      "subtitle": "Used to compute calorie burn during workouts.",
      "weightLabel": "Weight (kg)",
      "weightPlaceholder": "e.g. 75",
      "weightError": "Between 20 and 300 kg",
      "heightLabel": "Height (cm)",
      "heightPlaceholder": "e.g. 178",
      "heightError": "Between 100 and 250 cm"
    },
    "fitnessLevel": {
      "title": "What's your fitness level?",
      "subtitle": "Shapes exercise difficulty and progression rate."
    },
    "goals": {
      "title": "What are you here for?",
      "subtitle": "Pick one or more. Shapes how your plan is put together.",
      "finish": "Finish setup"
    }
  },
  "dashboard": {
    "hello": "Hello",
    "friend": "friend",
    "restDay": "Rest day",
    "restDaySubtitle": "Recover, hydrate, walk the stairs if you feel like it.",
    "allSessionsToday": "ALL SESSIONS TODAY",
    "caloriesToday": "CALORIES TODAY",
    "emptyTitle": "No plan yet",
    "emptySubtitle": "Generate a personalized plan with your goals, schedule, and constraints. Takes about a minute.",
    "generateCta": "Generate Plan"
  },
  "upNext": {
    "eyebrow": "UP NEXT",
    "rightNow": "RIGHT NOW",
    "inMinutes": "IN {{minutes}} MIN",
    "startsAt": "STARTS AT {{time}}",
    "start": "Start",
    "postpone": "Postpone"
  },
  "dayStrip": {
    "today": "TODAY",
    "rest": "Rest"
  },
  "settings": {
    "title": "Settings",
    "sections": {
      "profile": "PROFILE",
      "appearance": "APPEARANCE",
      "reminders": "REMINDERS & POLISH",
      "postpone": "POSTPONE",
      "language": "LANGUAGE"
    },
    "profileRow": {
      "label": "User profile",
      "notSet": "Not set"
    },
    "planRow": {
      "edit": "Edit plan",
      "editSubtitle": "Update schedule and re-generate",
      "generate": "Generate plan",
      "generateSubtitle": "Create your first workout plan"
    },
    "theme": "Theme",
    "themeOptions": {
      "system": "System",
      "light": "Light",
      "dark": "Dark"
    },
    "notifications": {
      "label": "Notifications",
      "subtitle": "Reminders for desk breaks and workouts"
    },
    "haptics": {
      "label": "Haptics",
      "subtitle": "Rumble on rep done, set complete"
    },
    "audio": {
      "label": "Audio cues",
      "subtitle": "Countdown beeps during timed exercises"
    },
    "keepAwake": {
      "label": "Keep screen on during workouts",
      "subtitle": "Prevents dimming while you're lifting"
    },
    "postponeBy": "Postpone by",
    "postponeHint": "Used when you tap Postpone on an up-next card.",
    "postponeMinutes_one": "{{count}} min",
    "postponeMinutes_few": "{{count}} min",
    "postponeMinutes_many": "{{count}} min",
    "postponeMinutes_other": "{{count}} min",
    "language": {
      "label": "Language",
      "system": "System",
      "english": "English",
      "ukrainian": "Українська"
    },
    "clearAll": "Clear all data",
    "confirmReset": {
      "title": "Clear everything?",
      "body": "This deletes your profile, current plan, and all progress.",
      "confirm": "Clear",
      "cancel": "Cancel",
      "finalTitle": "Really clear?",
      "finalBody": "This cannot be undone.",
      "finalConfirm": "Yes, clear everything"
    }
  },
  "profileEdit": {
    "changePhoto": "Change photo",
    "sections": {
      "dob": "DATE OF BIRTH",
      "body": "BODY",
      "fitnessLevel": "FITNESS LEVEL",
      "goals": "GOALS"
    },
    "nameLabel": "Name",
    "weightLabel": "Weight (kg)",
    "heightLabel": "Height (cm)",
    "save": "Save",
    "validationTitle": "Check your inputs",
    "validationBody": "Name, weight, height, and at least one goal are required.",
    "photoErrorTitle": "Could not save photo"
  },
  "plan": {
    "generate": {
      "title": "Plan settings",
      "subtitle": "A few details about your workday so the plan fits around real life.",
      "sections": {
        "timeBudget": "DAILY TIME BUDGET",
        "workHours": "WORK HOURS",
        "meetingDensity": "MEETING DENSITY",
        "lunchBreak": "LUNCH BREAK",
        "limitations": "LIMITATIONS",
        "disliked": "DISLIKED EXERCISES",
        "period": "PERIOD"
      },
      "timeBudgetValue": "{{minutes}} min / day",
      "timeBudgetHint": "Main workout + desk breaks together.",
      "workStart": "Start",
      "workEnd": "End",
      "meetingDensityHint": "How busy is your calendar on a typical day?",
      "lunchToggle": "I take a lunch break",
      "yes": "Yes",
      "no": "No",
      "limitationsHint": "Any of these? Pick all that apply. Exercises with matching contraindications will be skipped.",
      "dislikedHint": "Ones to never include. Tap to toggle.",
      "dislikedCount": "(showing first {{shown}} of {{total}})",
      "buildPrompt": "Build prompt",
      "promptReady": "Your prompt is ready",
      "promptReadySubtitle": "Copy this, paste it into Claude (or another LLM), and bring the JSON response back here.",
      "copyToClipboard": "Copy prompt to clipboard",
      "copied": "Copied!",
      "havePlan": "I have my plan — paste it",
      "backToForm": "Back to form",
      "buildErrorTitle": "Couldn't build prompt"
    },
    "paste": {
      "title": "Paste your plan",
      "subtitle": "Paste the JSON the LLM produced. We'll validate it against the schema and make sure every exercise is in the catalog.",
      "placeholder": "Paste the JSON here…",
      "pasteFromClipboard": "Paste from clipboard",
      "validate": "Validate",
      "errorsFound_one": "{{count}} error found",
      "errorsFound_few": "{{count}} errors found",
      "errorsFound_many": "{{count}} errors found",
      "errorsFound_other": "{{count}} errors found",
      "moreErrors": "… and {{count}} more.",
      "looksGood": "✓ Looks good",
      "save": "Save plan",
      "stats": {
        "period": "Period",
        "days": "Days",
        "daysValue": "{{total}} ({{active}} active)",
        "sessions": "Sessions",
        "exercisesTotal": "Exercises total",
        "estimatedCalories": "Estimated calories",
        "estimatedCaloriesValue": "{{min}}–{{max}} kcal"
      }
    },
    "preview": {
      "notFound": "Session not found.",
      "start": "Start Workout",
      "back": "Back",
      "watchOut": "Watch out: {{mistakes}}",
      "unknownExercise": "Unknown exercise: {{id}}",
      "rounds_one": "{{count}} round",
      "rounds_few": "{{count}} rounds",
      "rounds_many": "{{count}} rounds",
      "rounds_other": "{{count}} rounds",
      "exerciseMeta": "{{sets}} × {{amount}} · rest {{rest}}s · ~{{kcal}} kcal"
    }
  },
  "workout": {
    "sessionNotFound": "Session not found.",
    "getReady": "GET READY",
    "rest": "REST",
    "upNext": "Up next: {{name}}",
    "setOf": "SET {{current}} OF {{total}}",
    "roundOf": "ROUND {{current}}/{{total}} · ",
    "setsProgress": "{{done}} / {{total}} sets",
    "done": "Done",
    "skip": "Skip",
    "skipRest": "Skip rest",
    "exit": {
      "title": "Exit workout?",
      "body": "Your progress so far will be saved.",
      "keepGoing": "Keep going",
      "confirm": "Exit"
    },
    "summary": {
      "title": "Nice work!",
      "kcal": "Actual calories",
      "kcalValue": "{{kcal}} kcal",
      "duration": "Duration",
      "durationValue": "{{min}} min",
      "completed": "Exercises completed",
      "completion": "Session completion",
      "completionValue": "{{pct}}%",
      "cta": "Done"
    },
    "units": {
      "reps_one": "{{count}} rep",
      "reps_few": "{{count}} reps",
      "reps_many": "{{count}} reps",
      "reps_other": "{{count}} reps",
      "seconds": "{{count}}s",
      "metersClimbed": "{{count}} m climbed",
      "secondsSublabel": "seconds",
      "repsSublabel": "reps · tap Done when finished",
      "metersSublabel": "meters climbed"
    }
  },
  "notifications": {
    "title": "Time for your {{sessionType}}",
    "body": "{{duration}} min · ~{{kcal}} kcal · window closes {{windowClose}}"
  },
  "errors": {
    "permissionDeniedTitle": "Permission denied",
    "permissionDeniedBody": "Enable notifications in your system Settings to get reminders."
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS. (JSON-only change.)

- [ ] **Step 3: Commit**

```bash
git add app/src/i18n/locales/en/common.json
git commit -m "feat(i18n): populate English common namespace"
```

---

## Task 6: Migrate onboarding screens to t()

**Files:**
- Modify: `app/app/onboarding/welcome.tsx`
- Modify: `app/app/onboarding/name.tsx`
- Modify: `app/app/onboarding/photo.tsx`
- Modify: `app/app/onboarding/dob.tsx`
- Modify: `app/app/onboarding/body.tsx`
- Modify: `app/app/onboarding/fitness-level.tsx`
- Modify: `app/app/onboarding/goals.tsx`
- Modify: `app/src/components/WizardFooter.tsx`

- [ ] **Step 1: Migrate `welcome.tsx`**

Add `import { useTranslation } from "react-i18next";`.

Inside `Welcome()`, after `const reset = useOnboardingStore(...)`, add `const { t } = useTranslation();`.

Replace `Welcome to Fitness` with `{t('onboarding.welcome.title')}`.
Replace the two-line subtitle (`Home workouts built around your workday.\nNo equipment. Reminds you to move. Survives meetings.`) with `{t('onboarding.welcome.subtitle')}`.
Replace `label="Get started"` with `label={t('onboarding.welcome.cta')}`.

- [ ] **Step 2: Migrate `name.tsx`**

Add `import { useTranslation } from "react-i18next";`.

Inside `NameStep()`, after state declarations, add `const { t } = useTranslation();`.

Replace `What should I call you?` with `{t('onboarding.name.title')}`.
Replace `Just a first name is fine — shown in greetings.` with `{t('onboarding.name.subtitle')}`.
Replace `placeholder="Your name"` with `placeholder={t('onboarding.name.placeholder')}`.

- [ ] **Step 3: Migrate `photo.tsx`**

Add `import { useTranslation } from "react-i18next";`.

Inside `PhotoStep()`, after `const [busy, setBusy] = useState(false);`, add `const { t } = useTranslation();`.

Replace `Add a profile photo?` with `{t('onboarding.photo.title')}`.
Replace `Optional. Shown on the dashboard.` with `{t('onboarding.photo.subtitle')}`.
Replace the ternary `{draft.photo_uri ? "Replace photo" : "Choose from library"}` with `{draft.photo_uri ? t('onboarding.photo.replace') : t('onboarding.photo.choose')}`.
Replace `Remove` with `{t('onboarding.photo.remove')}`.

In the `catch` block of `pick()`:
```ts
Alert.alert("Couldn't pick photo", msg);
```
becomes:
```ts
Alert.alert(t('onboarding.photo.pickError'), msg);
```

- [ ] **Step 4: Migrate `dob.tsx`**

Add `import { useTranslation } from "react-i18next";`.

Inside `DobStep()`, after state declarations, add `const { t } = useTranslation();`.

Replace `When were you born?` with `{t('onboarding.dob.title')}`.
Replace `Used to age-adjust exercise selection and targets.` with `{t('onboarding.dob.subtitle')}`.

- [ ] **Step 5: Migrate `body.tsx`**

Add `import { useTranslation } from "react-i18next";`.

Inside `BodyStep()`, after the existing state declarations, add `const { t } = useTranslation();`.

Replace `A few body measurements` with `{t('onboarding.body.title')}`.
Replace `Used to compute calorie burn during workouts.` with `{t('onboarding.body.subtitle')}`.

For the first `TextField`:
```ts
label="Weight (kg)"
placeholder="e.g. 75"
```
becomes:
```ts
label={t('onboarding.body.weightLabel')}
placeholder={t('onboarding.body.weightPlaceholder')}
```

Replace the `weightErr` literal `"Between 20 and 300 kg"` with `t('onboarding.body.weightError')`.

For the second `TextField`:
```ts
label="Height (cm)"
placeholder="e.g. 178"
```
becomes:
```ts
label={t('onboarding.body.heightLabel')}
placeholder={t('onboarding.body.heightPlaceholder')}
```

Replace the `heightErr` literal `"Between 100 and 250 cm"` with `t('onboarding.body.heightError')`.

- [ ] **Step 6: Migrate `fitness-level.tsx`**

Add `import { useTranslation } from "react-i18next";` (already added in Task 4 Step 12 — verify).

Replace `What's your fitness level?` with `{t('onboarding.fitnessLevel.title')}`.
Replace `Shapes exercise difficulty and progression rate.` with `{t('onboarding.fitnessLevel.subtitle')}`.

- [ ] **Step 7: Migrate `goals.tsx`**

Replace `What are you here for?` with `{t('onboarding.goals.title')}`.
Replace `Pick one or more. Shapes how your plan is put together.` with `{t('onboarding.goals.subtitle')}`.
Replace `nextLabel="Finish setup"` with `nextLabel={t('onboarding.goals.finish')}`.

- [ ] **Step 8: Migrate `WizardFooter.tsx`**

Add `import { useTranslation } from "react-i18next";`.

Inside `WizardFooter`, after `const theme = useTheme();`, add:
```ts
const { t } = useTranslation();
```

Change the default value of `nextLabel` from `"Continue"` to a conditional. Replace:
```ts
nextLabel = "Continue",
```
with:
```ts
nextLabel,
```

And inside the JSX, replace `<Button label={nextLabel} ...>` with:
```tsx
<Button label={nextLabel ?? t('wizard.continue')} onPress={onNext} disabled={nextDisabled} />
```

Replace `Step {step + 1} of {total}` with `{t('wizard.stepOf', { current: step + 1, total })}`.

Replace `← Back` with `{t('wizard.back')}`.

Replace `Skip` with `{t('wizard.skip')}`.

- [ ] **Step 9: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add app/app/onboarding/ app/src/components/WizardFooter.tsx
git commit -m "feat(i18n): localize onboarding screens"
```

---

## Task 7: Migrate tabs, dashboard, settings, and small components

**Files:**
- Modify: `app/app/(tabs)/_layout.tsx`
- Modify: `app/app/(tabs)/index.tsx`
- Modify: `app/app/(tabs)/settings.tsx`
- Modify: `app/src/components/UpNextCard.tsx`
- Modify: `app/src/components/DayStrip.tsx`
- Modify: `app/app/profile/edit.tsx`

- [ ] **Step 1: Migrate `(tabs)/_layout.tsx`**

Add `import { useTranslation } from "react-i18next";`.

Inside `TabsLayout`, after `const theme = useTheme();`, add `const { t } = useTranslation();`.

Replace `title: "Plan"` with `title: t('tabs.plan')`.
Replace `title: "Settings"` with `title: t('tabs.settings')`.

- [ ] **Step 2: Migrate `(tabs)/index.tsx` dashboard**

Add `import { useTranslation } from "react-i18next";`.

Inside `PlanDashboard`, after store selectors, add `const { t } = useTranslation();`.

Replace `No plan yet` → `{t('dashboard.emptyTitle')}`.
Replace the empty subtitle paragraph (`Generate a personalized plan with your goals, schedule, and constraints. Takes about a minute.`) → `{t('dashboard.emptySubtitle')}`.
Replace `label="Generate Plan"` → `label={t('dashboard.generateCta')}`.

Replace `Rest day` → `{t('dashboard.restDay')}`.
Replace `Recover, hydrate, walk the stairs if you feel like it.` → `{t('dashboard.restDaySubtitle')}`.

Replace `ALL SESSIONS TODAY` → `{t('dashboard.allSessionsToday')}`.

In `Header` sub-component, add `const { t } = useTranslation();` at the top, then replace `Hello` → `{t('dashboard.hello')}` and `{name || "friend"}` → `{name || t('dashboard.friend')}`.

In `CalorieBar` sub-component, add `const { t } = useTranslation();` at the top, then replace `CALORIES TODAY` → `{t('dashboard.caloriesToday')}`.

- [ ] **Step 3: Migrate `(tabs)/settings.tsx`**

Rewrite the file. Replace the entire file contents with:

```tsx
import React from "react";
import { View, Text, Switch, StyleSheet, Pressable, Alert } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { Screen } from "@src/components/Screen";
import { Card } from "@src/components/Card";
import { Chip } from "@src/components/Chip";
import { Button } from "@src/components/Button";
import { useTheme } from "@src/theme/ThemeProvider";
import { useProfileStore } from "@src/store/profileStore";
import { usePlanStore } from "@src/store/planStore";
import {
  useSettingsStore,
  type ThemePreference,
  type LanguagePref,
} from "@src/store/settingsStore";
import { cancelAll, requestPermission } from "@src/lib/scheduler";

const THEMES: ThemePreference[] = ["system", "light", "dark"];
const LANGUAGES: LanguagePref[] = ["system", "en", "uk"];

export default function SettingsTab() {
  const theme = useTheme();
  const { t } = useTranslation();
  const profile = useProfileStore((s) => s.profile);
  const clearProfile = useProfileStore((s) => s.clearProfile);
  const clearPlan = usePlanStore((s) => s.clearPlan);
  const plan = usePlanStore((s) => s.plan);

  const settings = useSettingsStore();

  const onToggleNotifications = async (v: boolean) => {
    if (v) {
      const ok = await requestPermission();
      if (!ok) {
        Alert.alert(
          t('errors.permissionDeniedTitle'),
          t('errors.permissionDeniedBody'),
        );
        return;
      }
    } else {
      await cancelAll();
    }
    settings.setNotificationsEnabled(v);
  };

  const confirmReset = () => {
    Alert.alert(
      t('settings.confirmReset.title'),
      t('settings.confirmReset.body'),
      [
        { text: t('settings.confirmReset.cancel'), style: "cancel" },
        {
          text: t('settings.confirmReset.confirm'),
          style: "destructive",
          onPress: () => {
            Alert.alert(
              t('settings.confirmReset.finalTitle'),
              t('settings.confirmReset.finalBody'),
              [
                { text: t('settings.confirmReset.cancel'), style: "cancel" },
                {
                  text: t('settings.confirmReset.finalConfirm'),
                  style: "destructive",
                  onPress: async () => {
                    await cancelAll();
                    clearProfile();
                    clearPlan();
                    router.replace("/onboarding/welcome");
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  const languageLabel = (l: LanguagePref) =>
    l === 'system'
      ? t('settings.language.system')
      : l === 'en'
      ? t('settings.language.english')
      : t('settings.language.ukrainian');

  return (
    <Screen scrollable>
      <Text style={[styles.header, { color: theme.colors.text }]}>
        {t('settings.title')}
      </Text>

      <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
        {t('settings.sections.profile')}
      </Text>
      <Card>
        <NavRow
          icon="person-circle-outline"
          label={t('settings.profileRow.label')}
          subtitle={profile?.name ?? t('settings.profileRow.notSet')}
          onPress={() => router.push("/profile/edit")}
        />
        <Separator />
        <NavRow
          icon="barbell-outline"
          label={plan ? t('settings.planRow.edit') : t('settings.planRow.generate')}
          subtitle={
            plan
              ? t('settings.planRow.editSubtitle')
              : t('settings.planRow.generateSubtitle')
          }
          onPress={() => router.push("/plan/generate")}
        />
      </Card>

      <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
        {t('settings.sections.appearance')}
      </Text>
      <Card>
        <Text style={[styles.rowTitle, { color: theme.colors.text }]}>
          {t('settings.theme')}
        </Text>
        <View
          style={{
            flexDirection: "row",
            gap: theme.spacing.sm,
            marginTop: theme.spacing.sm,
          }}
        >
          {THEMES.map((tp) => (
            <Chip
              key={tp}
              label={t(`settings.themeOptions.${tp}`)}
              selected={settings.theme === tp}
              onPress={() => settings.setTheme(tp)}
            />
          ))}
        </View>
      </Card>

      <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
        {t('settings.sections.language')}
      </Text>
      <Card>
        <Text style={[styles.rowTitle, { color: theme.colors.text }]}>
          {t('settings.language.label')}
        </Text>
        <View
          style={{
            flexDirection: "row",
            gap: theme.spacing.sm,
            marginTop: theme.spacing.sm,
            flexWrap: "wrap",
          }}
        >
          {LANGUAGES.map((l) => (
            <Chip
              key={l}
              label={languageLabel(l)}
              selected={settings.language === l}
              onPress={() => settings.setLanguage(l)}
            />
          ))}
        </View>
      </Card>

      <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
        {t('settings.sections.reminders')}
      </Text>
      <Card>
        <ToggleRow
          icon="notifications-outline"
          label={t('settings.notifications.label')}
          subtitle={t('settings.notifications.subtitle')}
          value={settings.notificationsEnabled}
          onChange={onToggleNotifications}
        />
        <Separator />
        <ToggleRow
          icon="pulse-outline"
          label={t('settings.haptics.label')}
          subtitle={t('settings.haptics.subtitle')}
          value={settings.hapticsEnabled}
          onChange={settings.setHapticsEnabled}
        />
        <Separator />
        <ToggleRow
          icon="volume-high-outline"
          label={t('settings.audio.label')}
          subtitle={t('settings.audio.subtitle')}
          value={settings.audioEnabled}
          onChange={settings.setAudioEnabled}
        />
        <Separator />
        <ToggleRow
          icon="sunny-outline"
          label={t('settings.keepAwake.label')}
          subtitle={t('settings.keepAwake.subtitle')}
          value={settings.keepAwakeEnabled}
          onChange={settings.setKeepAwakeEnabled}
        />
      </Card>

      <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
        {t('settings.sections.postpone')}
      </Text>
      <Card>
        <Text style={[styles.rowTitle, { color: theme.colors.text }]}>
          {t('settings.postponeBy')}
        </Text>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: 12,
            marginTop: 2,
          }}
        >
          {t('settings.postponeHint')}
        </Text>
        <View
          style={{
            flexDirection: "row",
            gap: theme.spacing.sm,
            marginTop: theme.spacing.sm,
            flexWrap: "wrap",
          }}
        >
          {[5, 10, 15, 20, 30].map((m) => (
            <Chip
              key={m}
              label={t('settings.postponeMinutes', { count: m })}
              selected={settings.postponeMinutes === m}
              onPress={() => settings.setPostponeMinutes(m)}
            />
          ))}
        </View>
      </Card>

      <View style={{ marginTop: theme.spacing.xl }}>
        <Button label={t('settings.clearAll')} onPress={confirmReset} variant="danger" />
      </View>
    </Screen>
  );
}

function NavRow({
  icon,
  label,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.navRow}>
      <Ionicons name={icon} size={22} color={theme.colors.primary} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: "600" }}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </Pressable>
  );
}

function ToggleRow({
  icon,
  label,
  subtitle,
  value,
  onChange,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.navRow}>
      <Ionicons name={icon} size={22} color={theme.colors.primary} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: "600" }}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.colors.surfaceAlt, true: theme.colors.primary }}
      />
    </View>
  );
}

function Separator() {
  const theme = useTheme();
  return (
    <View
      style={{
        height: 1,
        backgroundColor: theme.colors.border,
        marginVertical: 8,
      }}
    />
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 28, fontWeight: "700", marginBottom: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginTop: 18,
    marginBottom: 6,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  rowTitle: { fontSize: 16, fontWeight: "600" },
});
```

- [ ] **Step 4: Migrate `UpNextCard.tsx` (add status string)**

Edit `app/src/components/UpNextCard.tsx`. The `useTranslation` hook was added in Task 4 Step 7; now use it for the eyebrow line.

Replace:
```tsx
const status =
  reason === "now"
    ? "Right now"
    : reason === "soon"
      ? `In ${minutesUntilStart} min`
      : `Starts at ${session.time_window.earliest}`;
```
with:
```tsx
const status =
  reason === "now"
    ? t('upNext.rightNow')
    : reason === "soon"
      ? t('upNext.inMinutes', { minutes: minutesUntilStart })
      : t('upNext.startsAt', { time: session.time_window.earliest });
```

Replace `UP NEXT · {status.toUpperCase()}` with:
```tsx
{t('upNext.eyebrow')} · {status}
```

Replace `label="Start"` with `label={t('upNext.start')}`.
Replace `label="Postpone"` with `label={t('upNext.postpone')}`.

- [ ] **Step 5: Migrate `DayStrip.tsx`**

Add `import { useTranslation } from "react-i18next";`.

Inside `DayStrip`, after `const theme = useTheme();`, add `const { t } = useTranslation();`.

Replace the literal `TODAY` with `{t('dayStrip.today')}`.
Replace the literal `Rest` with `{t('dayStrip.rest')}`.

- [ ] **Step 6: Migrate `profile/edit.tsx`**

`useTranslation` is already imported (Task 4 Step 10).

Replace:
- `Change photo` → `{t('profileEdit.changePhoto')}`
- `label="Name"` → `label={t('profileEdit.nameLabel')}`
- `DATE OF BIRTH` → `{t('profileEdit.sections.dob')}`
- `BODY` → `{t('profileEdit.sections.body')}`
- `FITNESS LEVEL` → `{t('profileEdit.sections.fitnessLevel')}`
- `GOALS` → `{t('profileEdit.sections.goals')}`
- `label="Weight (kg)"` → `label={t('profileEdit.weightLabel')}`
- `label="Height (cm)"` → `label={t('profileEdit.heightLabel')}`
- `label="Save"` → `label={t('profileEdit.save')}`

In the `save()` function, replace:
```ts
Alert.alert("Check your inputs", "Name, weight, height, and at least one goal are required.");
```
with:
```ts
Alert.alert(t('profileEdit.validationTitle'), t('profileEdit.validationBody'));
```

In `pickPhoto()`:
```ts
Alert.alert("Could not save photo", msg);
```
with:
```ts
Alert.alert(t('profileEdit.photoErrorTitle'), msg);
```

- [ ] **Step 7: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/app/\(tabs\)/ app/app/profile/ app/src/components/UpNextCard.tsx app/src/components/DayStrip.tsx
git commit -m "feat(i18n): localize tabs, dashboard, settings, profile edit"
```

---

## Task 8: Migrate plan/generate and plan/paste screens

**Files:**
- Modify: `app/app/plan/generate.tsx`
- Modify: `app/app/plan/paste.tsx`

- [ ] **Step 1: Migrate `plan/generate.tsx`**

`useTranslation` is already imported (Task 4 Step 9).

Replace the following literal strings with t() calls (in order of appearance):

- `Your prompt is ready` → `{t('plan.generate.promptReady')}`
- `Copy this, paste it into Claude (or another LLM), and bring the JSON response back here.` → `{t('plan.generate.promptReadySubtitle')}`
- `label={copied ? "Copied!" : "Copy prompt to clipboard"}` → `label={copied ? t('plan.generate.copied') : t('plan.generate.copyToClipboard')}`
- `label="I have my plan — paste it"` → `label={t('plan.generate.havePlan')}`
- `label="Back to form"` → `label={t('plan.generate.backToForm')}`
- `Plan settings` → `{t('plan.generate.title')}`
- `A few details about your workday so the plan fits around real life.` → `{t('plan.generate.subtitle')}`
- `DAILY TIME BUDGET` → `{t('plan.generate.sections.timeBudget')}`
- `{availableMinutes} min / day` → `{t('plan.generate.timeBudgetValue', { minutes: availableMinutes })}`
- `Main workout + desk breaks together.` → `{t('plan.generate.timeBudgetHint')}`
- `WORK HOURS` → `{t('plan.generate.sections.workHours')}`
- In the `TimePickerField` for work hours, replace `label="Start"` → `label={t('plan.generate.workStart')}` and `label="End"` → `label={t('plan.generate.workEnd')}`
- `MEETING DENSITY` → `{t('plan.generate.sections.meetingDensity')}`
- `How busy is your calendar on a typical day?` → `{t('plan.generate.meetingDensityHint')}`
- `LUNCH BREAK` → `{t('plan.generate.sections.lunchBreak')}`
- `I take a lunch break` → `{t('plan.generate.lunchToggle')}`
- `{lunchEnabled ? "Yes" : "No"}` → `{lunchEnabled ? t('plan.generate.yes') : t('plan.generate.no')}`
- The lunch `TimePickerField` labels, same as work hours
- `LIMITATIONS` → `{t('plan.generate.sections.limitations')}`
- `Any of these? Pick all that apply. Exercises with matching contraindications will be skipped.` → `{t('plan.generate.limitationsHint')}`
- `DISLIKED EXERCISES` → `{t('plan.generate.sections.disliked')}`
- `Ones to never include. Tap to toggle.` → `{t('plan.generate.dislikedHint')}`
- `(showing first 40 of {catalog.exercises.length})` → `{t('plan.generate.dislikedCount', { shown: 40, total: catalog.exercises.length })}`
- `PERIOD` → `{t('plan.generate.sections.period')}`
- The chip labels for period types:
  ```tsx
  label={p.charAt(0).toUpperCase() + p.slice(1)}
  ```
  becomes:
  ```tsx
  label={t(`enums:periodTypes.${p}`)}
  ```
- `label="Build prompt"` → `label={t('plan.generate.buildPrompt')}`

In `buildAndShow()` catch block:
```ts
Alert.alert("Couldn't build prompt", msg);
```
becomes:
```ts
Alert.alert(t('plan.generate.buildErrorTitle'), msg);
```

`catalog.exercises[i].name` at line `label={ex.name}` (inside the disliked chips map): this reads the old text field. Temporarily replace with `label={ex.id}` until Task 10 migrates it properly — or better, import `exerciseText`. Since `exerciseText` comes in Task 10, wire the quick fix now and revisit:

```tsx
label={ex.id}
```

(We'll swap to `exerciseText(ex.id).name` in Task 10. This keeps the screen compiling.)

- [ ] **Step 2: Migrate `plan/paste.tsx`**

Add `import { useTranslation } from "react-i18next";`.

Inside `PastePlan`, after `const setPlan = usePlanStore(...)`, add `const { t } = useTranslation();`.

Replace:
- `Paste your plan` → `{t('plan.paste.title')}`
- `Paste the JSON the LLM produced. We'll validate it against the schema and make sure every exercise is in the catalog.` → `{t('plan.paste.subtitle')}`
- `placeholder="Paste the JSON here…"` → `placeholder={t('plan.paste.placeholder')}`
- `label="Paste from clipboard"` → `label={t('plan.paste.pasteFromClipboard')}`
- `label="Validate"` → `label={t('plan.paste.validate')}`
- `{errors.length} error{errors.length > 1 ? "s" : ""} found` → `{t('plan.paste.errorsFound', { count: errors.length })}`
- `… and {errors.length - 30} more.` → `{t('plan.paste.moreErrors', { count: errors.length - 30 })}`
- `✓ Looks good` → `{t('plan.paste.looksGood')}`
- `label="Save plan"` → `label={t('plan.paste.save')}`

In `PlanPreviewCard`, add a `useTranslation` hook at the top of the function and replace:
- `label="Period"` → `label={t('plan.paste.stats.period')}`
- `label="Days"` → `label={t('plan.paste.stats.days')}`
- `value={`${stats.days} (${stats.activeDays} active)`}` → `value={t('plan.paste.stats.daysValue', { total: stats.days, active: stats.activeDays })}`
- `label="Sessions"` → `label={t('plan.paste.stats.sessions')}`
- `label="Exercises total"` → `label={t('plan.paste.stats.exercisesTotal')}`
- `label="Estimated calories"` → `label={t('plan.paste.stats.estimatedCalories')}`
- `value={`${Math.round(stats.caloriesMin)}–${Math.round(stats.caloriesMax)} kcal`}` → `value={t('plan.paste.stats.estimatedCaloriesValue', { min: Math.round(stats.caloriesMin), max: Math.round(stats.caloriesMax) })}`

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/app/plan/generate.tsx app/app/plan/paste.tsx
git commit -m "feat(i18n): localize plan generate and paste screens"
```

---

## Task 9: Migrate workout runner and session preview screens

**Files:**
- Modify: `app/app/workout/[sessionId].tsx`
- Modify: `app/app/plan/preview/[sessionId].tsx`

These files still reference `exercise.name`, `exercise.instructions`, and `exercise.common_mistakes` from the catalog. We will migrate ONLY the UI strings (literal English) in this task — the catalog reads stay pointed at the existing fields. Task 10 handles the catalog split and exerciseText() helper.

- [ ] **Step 1: Migrate workout runner UI strings**

Edit `app/app/workout/[sessionId].tsx`.

Add `import { useTranslation } from "react-i18next";` to the top imports.

Inside `WorkoutRunner()`, after theme hook, add `const { t } = useTranslation();`.

Replace literal strings:
- `Session not found.` → `{t('workout.sessionNotFound')}`
- `{setsCompleted.current} / {totalSets} sets` → `{t('workout.setsProgress', { done: setsCompleted.current, total: totalSets })}`

In `confirmExit()`:
```ts
Alert.alert(
  "Exit workout?",
  "Your progress so far will be saved.",
  [
    { text: "Keep going", style: "cancel" },
    { text: "Exit", ... },
  ],
);
```
becomes:
```ts
Alert.alert(
  t('workout.exit.title'),
  t('workout.exit.body'),
  [
    { text: t('workout.exit.keepGoing'), style: "cancel" },
    {
      text: t('workout.exit.confirm'),
      style: "destructive",
      onPress: async () => {
        if (session) {
          markSessionExecution(session.session_id, {
            status: "partial",
            actual_duration_minutes: Math.round(
              (Date.now() - new Date(startedAtRef.current).getTime()) /
                60000,
            ),
          });
        }
        router.back();
      },
    },
  ],
);
```

For the `CountdownView` sub-component — add `const { t } = useTranslation();`. Replace `GET READY` with `{t('workout.getReady')}`.

For the `SetView` sub-component — add `const { t } = useTranslation();`. Replace:
```tsx
{step.totalRounds > 1
  ? `ROUND ${step.roundIdx + 1}/${step.totalRounds} · `
  : ""}
SET {step.setIdx + 1} OF {step.totalSets}
```
with:
```tsx
{step.totalRounds > 1
  ? t('workout.roundOf', { current: step.roundIdx + 1, total: step.totalRounds })
  : ""}
{t('workout.setOf', { current: step.setIdx + 1, total: step.totalSets })}
```

Replace the three `ProgressRing` sublabels:
- `sublabel="seconds"` → `sublabel={t('workout.units.secondsSublabel')}`
- `sublabel="reps · tap Done when finished"` → `sublabel={t('workout.units.repsSublabel')}`
- `sublabel="meters climbed"` → `sublabel={t('workout.units.metersSublabel')}`

Replace button labels:
- `label="Done"` → `label={t('workout.done')}`
- `label="Skip"` → `label={t('workout.skip')}`

For `RestView`, add `const { t } = useTranslation();`. Replace:
- `REST` → `{t('workout.rest')}`
- `Up next: {nextName}` → `{t('workout.upNext', { name: nextName })}`
- `label="Skip rest"` → `label={t('workout.skipRest')}`

For `SummaryScreen`, add `const { t } = useTranslation();`. Replace:
- `Nice work!` → `{t('workout.summary.title')}`
- `label="Actual calories"` → `label={t('workout.summary.kcal')}`
- `value={`${kcal} kcal`}` → `value={t('workout.summary.kcalValue', { kcal })}`
- `label="Duration"` → `label={t('workout.summary.duration')}`
- `value={`${mins} min`}` → `value={t('workout.summary.durationValue', { min: mins })}`
- `label="Exercises completed"` → `label={t('workout.summary.completed')}`
- `label="Session completion"` → `label={t('workout.summary.completion')}`
- `value={`${pct}%`}` → `value={t('workout.summary.completionValue', { pct })}`
- `label="Done"` → `label={t('workout.summary.cta')}`

- [ ] **Step 2: Migrate session preview UI strings**

Edit `app/app/plan/preview/[sessionId].tsx`.

`useTranslation` is already imported (Task 4 Step 8).

Replace:
- `Session not found.` → `{t('plan.preview.notFound')}`
- `label="Back"` → `label={t('plan.preview.back')}`
- `label="Start Workout"` → `label={t('plan.preview.start')}`
- `Unknown exercise: {ex.exercise_id}` → `{t('plan.preview.unknownExercise', { id: ex.exercise_id })}`
- `{block.rounds === 1 ? "round" : "rounds"}` → `{t('plan.preview.rounds', { count: block.rounds })}` (and drop the `{block.rounds}` literal before it since it's already in the i18n string)

Actually for the block-type + rounds line:
```tsx
{block.block_type.toUpperCase()} · {block.rounds}{" "}
{block.rounds === 1 ? "round" : "rounds"}
```
becomes:
```tsx
{t(`enums:blockTypes.${block.block_type}`).toUpperCase()} · {t('plan.preview.rounds', { count: block.rounds })}
```

In `ExerciseRow`, replace the `amountLabel` construction:
```tsx
const amountLabel =
  ex.unit === "reps"
    ? `${ex.amount} reps`
    : ex.unit === "seconds"
      ? `${ex.amount}s`
      : `${ex.amount} m climbed`;
```
with:
```tsx
const amountLabel =
  ex.unit === "reps"
    ? t('workout.units.reps', { count: ex.amount })
    : ex.unit === "seconds"
      ? t('workout.units.seconds', { count: ex.amount })
      : t('workout.units.metersClimbed', { count: ex.amount });
```

Replace:
```tsx
{ex.sets} × {amountLabel} · rest {ex.rest_seconds}s · ~
{Math.round(ex.estimated_calories)} kcal
```
with:
```tsx
{t('plan.preview.exerciseMeta', {
  sets: ex.sets,
  amount: amountLabel,
  rest: ex.rest_seconds,
  kcal: Math.round(ex.estimated_calories),
})}
```

Replace:
```tsx
Watch out: {catEx.common_mistakes.join(", ")}
```
with:
```tsx
{t('plan.preview.watchOut', { mistakes: catEx.common_mistakes.join(", ") })}
```

Note: `catEx.name`, `catEx.instructions`, and `catEx.common_mistakes` are still being read from the catalog object. Task 10 swaps them to `exerciseText(id)`. Leave these reads in place for now — they compile fine.

In `ExerciseRow`, add `const { t } = useTranslation();` at the top of the function (after `const theme = useTheme();`).

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/app/workout/\[sessionId\].tsx app/app/plan/preview/\[sessionId\].tsx
git commit -m "feat(i18n): localize workout runner and session preview"
```

---

## Task 10: Split exercise catalog text out of exercises.json

**Files:**
- Create: `app/scripts/extract-exercise-text.ts`
- Create: `locales/en/exercises.json` (project root, `/Users/lion/Documents/Projects/mine/fitness/locales/en/exercises.json`)
- Create: `locales/uk/exercises.json` (project root, empty stub matching English keys)
- Modify: `/Users/lion/Documents/Projects/mine/fitness/exercises.json` (strip text fields)
- Modify: `app/src/types/catalog.ts`
- Modify: `app/src/lib/catalog.ts`
- Modify: `app/src/lib/prompt.ts`
- Modify: `app/src/lib/runner.ts`
- Modify: `app/app/plan/preview/[sessionId].tsx`
- Modify: `app/app/plan/generate.tsx`
- Modify: `app/scripts/sync-data.sh`
- Modify: `app/src/i18n/locales/en/exercises.json` (populated via sync-data.sh)
- Modify: `app/src/i18n/locales/uk/exercises.json` (populated via sync-data.sh; stub for now)

- [ ] **Step 1: Create the extractor script `app/scripts/extract-exercise-text.ts`**

```ts
// One-shot tool: splits the original `exercises.json` (at the project root)
// into a structural version + a locales/en/exercises.json dictionary.
//
// Usage (from app/):
//   npx tsx scripts/extract-exercise-text.ts
//
// Writes:
//   ../exercises.json                (overwritten, text fields removed)
//   ../locales/en/exercises.json     (created)
//   ../locales/uk/exercises.json     (created, stub with same keys)
//
// Run this ONCE during the i18n migration. After running, commit both
// changes; the extractor is not invoked again.

import * as fs from 'node:fs';
import * as path from 'node:path';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(PROJECT_ROOT, 'exercises.json');
const LOCALES_DIR = path.join(PROJECT_ROOT, 'locales');
const EN_DIR = path.join(LOCALES_DIR, 'en');
const UK_DIR = path.join(LOCALES_DIR, 'uk');

type ExerciseIn = {
  id: string;
  name: string;
  instructions: string[];
  common_mistakes: string[];
  modifications: { easier: string; harder: string };
  notes: string | null;
  [rest: string]: unknown;
};

const raw = fs.readFileSync(SRC, 'utf8');
const catalog = JSON.parse(raw) as { exercises: ExerciseIn[]; [k: string]: unknown };

const enDict: Record<string, Omit<ExerciseIn, 'id' | 'category' | 'body_parts' | 'equipment' | 'difficulty' | 'default_unit' | 'default_amount' | 'default_sets' | 'default_rest_seconds' | 'met_value' | 'seconds_per_rep' | 'contraindications' | 'desk_friendly' | 'noise_level'>> = {};
const ukDict: typeof enDict = {};

const strippedExercises = catalog.exercises.map((ex) => {
  enDict[ex.id] = {
    name: ex.name,
    instructions: ex.instructions,
    common_mistakes: ex.common_mistakes,
    modifications: ex.modifications,
    notes: ex.notes,
  };
  ukDict[ex.id] = {
    name: '',
    instructions: ex.instructions.map(() => ''),
    common_mistakes: ex.common_mistakes.map(() => ''),
    modifications: { easier: '', harder: '' },
    notes: ex.notes === null ? null : '',
  };
  // Remove text fields from the structural copy.
  const { name: _n, instructions: _i, common_mistakes: _cm, modifications: _m, notes: _nt, ...rest } = ex;
  return rest;
});

const newCatalog = { ...catalog, exercises: strippedExercises };

fs.mkdirSync(EN_DIR, { recursive: true });
fs.mkdirSync(UK_DIR, { recursive: true });

fs.writeFileSync(SRC, JSON.stringify(newCatalog, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(EN_DIR, 'exercises.json'), JSON.stringify(enDict, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(UK_DIR, 'exercises.json'), JSON.stringify(ukDict, null, 2) + '\n', 'utf8');

console.log(`Wrote ${Object.keys(enDict).length} exercises to locales/en/exercises.json`);
console.log(`Wrote Ukrainian stub to locales/uk/exercises.json`);
console.log(`Stripped text fields from ${SRC}`);
```

- [ ] **Step 2: Run the extractor**

Install `tsx` if not already present, then run:

```bash
cd /Users/lion/Documents/Projects/mine/fitness/app
npx --yes tsx scripts/extract-exercise-text.ts
```

Expected output (roughly):
```
Wrote 75 exercises to locales/en/exercises.json
Wrote Ukrainian stub to locales/uk/exercises.json
Stripped text fields from /Users/lion/Documents/Projects/mine/fitness/exercises.json
```

Verify by peeking at a few files:

```bash
head -30 /Users/lion/Documents/Projects/mine/fitness/exercises.json
head -20 /Users/lion/Documents/Projects/mine/fitness/locales/en/exercises.json
```

The stripped catalog should no longer have `name`, `instructions`, `common_mistakes`, `modifications`, or `notes` fields. The `contraindications` field should still be there.

- [ ] **Step 3: Update `app/scripts/sync-data.sh`**

Add locale mirroring. Append before the final `echo` lines:

```bash
LOCALES_SRC="$SRC/locales"
LOCALES_DEST="$APP_ROOT/src/i18n/locales"
mkdir -p "$LOCALES_DEST/en" "$LOCALES_DEST/uk"
cp "$LOCALES_SRC/en/exercises.json" "$LOCALES_DEST/en/exercises.json"
cp "$LOCALES_SRC/uk/exercises.json" "$LOCALES_DEST/uk/exercises.json"
```

Full updated script:

```bash
#!/usr/bin/env bash
# Sync the data foundation from the project root into the app's bundled assets.
# Run this whenever the root-level data files change.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(cd "$HERE/.." && pwd)"
SRC="$(cd "$APP_ROOT/.." && pwd)"
DEST="$APP_ROOT/assets/data"

mkdir -p "$DEST"

cp "$SRC/exercises.json"            "$DEST/exercises.json"
cp "$SRC/workout-plan.schema.json"  "$DEST/workout-plan.schema.json"
cp "$SRC/sample-weekly-plan.json"   "$DEST/sample-weekly-plan.json"

LOCALES_SRC="$SRC/locales"
LOCALES_DEST="$APP_ROOT/src/i18n/locales"
mkdir -p "$LOCALES_DEST/en" "$LOCALES_DEST/uk"
cp "$LOCALES_SRC/en/exercises.json" "$LOCALES_DEST/en/exercises.json"
cp "$LOCALES_SRC/uk/exercises.json" "$LOCALES_DEST/uk/exercises.json"

# The prompt template is bundled as a TS string literal so we don't need a
# metro asset-extension hack. Write it into src/lib/prompt-template.generated.ts.
TS_DEST="$APP_ROOT/src/lib/prompt-template.generated.ts"
PROMPT_SRC="$SRC/workout-generator-prompt.md"
{
  printf '// AUTO-GENERATED from ../../../workout-generator-prompt.md by scripts/sync-data.sh\n'
  printf '// Do not edit by hand — re-run: npm run sync-data\n\n'
  printf 'export const PROMPT_TEMPLATE = '
  sed -e 's/\\/\\\\/g' -e 's/`/\\`/g' -e 's/\${/\\${/g' "$PROMPT_SRC" \
    | awk 'BEGIN{printf "`"} {print} END{printf "`;\n"}'
} > "$TS_DEST"

echo "Synced data foundation into $DEST"
echo "Synced locale files into $LOCALES_DEST"
echo "Wrote prompt template to $TS_DEST"
```

- [ ] **Step 4: Run sync-data.sh to mirror the new locale files**

```bash
cd /Users/lion/Documents/Projects/mine/fitness/app
./scripts/sync-data.sh
```

Expected: the app now has `assets/data/exercises.json` (stripped) and `src/i18n/locales/{en,uk}/exercises.json` populated.

- [ ] **Step 5: Update `src/types/catalog.ts`**

Remove text fields from the `Exercise` interface:

```ts
// Types for the exercise catalog (exercises.json).

import type { DefaultUnit, ExerciseCategory, NoiseLevel } from "./enums";

export type Equipment = "none" | "chair" | "wall" | "stairs" | "doorway";

export interface Exercise {
  id: string;
  category: ExerciseCategory;
  body_parts: string[];
  equipment: Equipment[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  default_unit: DefaultUnit;
  default_amount: number;
  default_sets: number;
  default_rest_seconds: number;
  met_value: number;
  seconds_per_rep: number | null;
  contraindications: string[];
  desk_friendly: boolean;
  noise_level: NoiseLevel;
}

export interface CalorieModel {
  formula: string;
  intensity_multipliers: {
    low: number;
    medium: number;
    high: number;
  };
  rest_intervals_excluded: boolean;
  notes: string;
}

export interface Catalog {
  version: string;
  calorie_model: CalorieModel;
  exercises: Exercise[];
  _comment?: string;
}
```

`ExerciseModifications` interface is no longer needed (deleted with the text fields). Delete its declaration.

- [ ] **Step 6: Add `exerciseText()` helper in `src/lib/catalog.ts`**

Append to the end of `app/src/lib/catalog.ts`:

```ts
import { i18n } from "@src/i18n";
import type { ExerciseText } from "@src/i18n/types";

/**
 * Returns the current-locale text for an exercise (name, instructions,
 * common mistakes, modifications, notes). Falls back to the exercise id if
 * the key is missing so the UI never renders an empty string.
 */
export function exerciseText(id: string): ExerciseText {
  const value = i18n.t(`exercises:${id}`, { returnObjects: true }) as unknown;
  if (
    !value ||
    typeof value !== 'object' ||
    !('name' in value)
  ) {
    return {
      name: id,
      instructions: [],
      common_mistakes: [],
      modifications: { easier: '', harder: '' },
      notes: null,
    };
  }
  return value as ExerciseText;
}
```

- [ ] **Step 7: Update `src/lib/prompt.ts` to merge structural + English text**

Replace the import block and add a merge function:

```ts
// Fill the workout-generator-prompt.md template with user inputs and the
// full embedded catalog / schema / sample plan.

import type { PeriodType, UserProfile } from "@src/types";
import { PROMPT_TEMPLATE } from "./prompt-template.generated";
// eslint-disable-next-line @typescript-eslint/no-var-requires
import exercisesStructural from "../../assets/data/exercises.json";
// eslint-disable-next-line @typescript-eslint/no-var-requires
import exercisesTextEn from "../i18n/locales/en/exercises.json";
// eslint-disable-next-line @typescript-eslint/no-var-requires
import planSchemaJson from "../../assets/data/workout-plan.schema.json";
// eslint-disable-next-line @typescript-eslint/no-var-requires
import sampleWeeklyPlanJson from "../../assets/data/sample-weekly-plan.json";

export interface PeriodChoice {
  type: PeriodType;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
}

function asJsonString(v: unknown): string {
  return JSON.stringify(v, null, 2);
}

type ExerciseTextEntry = {
  name: string;
  instructions: string[];
  common_mistakes: string[];
  modifications: { easier: string; harder: string };
  notes: string | null;
};

// Merges the structural catalog with the English exercise text dictionary so
// the LLM receives the same full-text shape it always has. The LLM keeps
// emitting English exercise ids regardless of the app's current language.
function mergedCatalogForPrompt(): object {
  const textMap = exercisesTextEn as unknown as Record<string, ExerciseTextEntry>;
  return {
    ...exercisesStructural,
    exercises: (exercisesStructural as { exercises: Array<{ id: string }> }).exercises.map((e) => ({
      ...e,
      ...(textMap[e.id] ?? {}),
    })),
  };
}

export function buildPrompt(
  profile: UserProfile,
  period: PeriodChoice,
): string {
  if (!profile.work_schedule || profile.available_minutes_per_day == null) {
    throw new Error(
      "Profile is missing schedule details. Fill them in Generate Plan before building the prompt.",
    );
  }

  const ws = profile.work_schedule;
  const focusBlocks = ws.protected_focus_blocks ?? [];
  const lunch = ws.lunch_break;

  const replacements: Record<string, string> = {
    "{{date_of_birth}}": profile.date_of_birth,
    "{{weight_kg}}": String(profile.weight_kg),
    "{{height_cm}}": String(profile.height_cm),
    "{{period_type}}": period.type,
    "{{period_start_date}}": period.start_date,
    "{{period_end_date}}": period.end_date,
    "{{fitness_level}}": profile.fitness_level,
    "{{primary_goals}}": JSON.stringify(profile.primary_goals),
    "{{available_minutes_per_day}}": String(profile.available_minutes_per_day),
    "{{work_hours_start}}": ws.work_hours.start,
    "{{work_hours_end}}": ws.work_hours.end,
    "{{typical_meeting_density}}": ws.typical_meeting_density,
    "{{protected_focus_blocks}}": JSON.stringify(focusBlocks),
    "{{lunch_break_start}}": lunch?.start ?? "null",
    "{{lunch_break_end}}": lunch?.end ?? "null",
    "{{limitations}}": JSON.stringify(profile.limitations),
    "{{disliked_exercise_ids}}": JSON.stringify(profile.disliked_exercise_ids),
  };

  let out = PROMPT_TEMPLATE;
  for (const [k, v] of Object.entries(replacements)) {
    out = out.split(k).join(v);
  }

  out = out.split("<<EXERCISES_JSON>>").join(asJsonString(mergedCatalogForPrompt()));
  out = out
    .split("<<WORKOUT_PLAN_SCHEMA_JSON>>")
    .join(asJsonString(planSchemaJson));
  out = out
    .split("<<SAMPLE_WEEKLY_PLAN_JSON>>")
    .join(asJsonString(sampleWeeklyPlanJson));

  return out;
}
```

- [ ] **Step 8: Update `src/lib/runner.ts` to use `exerciseText()`**

Edit `app/src/lib/runner.ts`:

Replace:
```ts
import { exerciseById } from "./catalog";
```
with:
```ts
import { exerciseById, exerciseText } from "./catalog";
```

Inside the outer loop, after `const cat = exerciseById(pe.exercise_id);`, change:
```ts
const exName = cat?.name ?? pe.exercise_id;
const instructions = cat?.instructions ?? [];
const mistakes = cat?.common_mistakes ?? [];
```
to:
```ts
const text = exerciseText(pe.exercise_id);
const exName = text.name;
const instructions = text.instructions;
const mistakes = text.common_mistakes;
```

For the three `nextName` computations that look like:
```ts
nextName = exerciseById(block.exercises[ei + 1].exercise_id)?.name ?? null;
```
replace with:
```ts
nextName = exerciseText(block.exercises[ei + 1].exercise_id).name;
```

Do the same for the other two similar lines (within-block loop and next-block loop). All three `.name` reads become `exerciseText(...).name`.

- [ ] **Step 9: Update `app/plan/preview/[sessionId].tsx` to use `exerciseText()`**

Add the import:
```ts
import { exerciseById, exerciseText } from "@src/lib/catalog";
```

Inside `ExerciseRow`, replace the `catEx` lookup and downstream reads:

```tsx
const catEx = exerciseById(ex.exercise_id);
```

Keep this line (it's still used to verify the exercise exists in the structural catalog). But add:

```tsx
const txt = exerciseText(ex.exercise_id);
```

Replace `{catEx.name}` → `{txt.name}`.
Replace `catEx.instructions.map(...)` → `txt.instructions.map(...)`.
Replace `catEx.common_mistakes` → `txt.common_mistakes`.

- [ ] **Step 10: Update `app/plan/generate.tsx` disliked-exercise chips**

Add `exerciseText` import:
```ts
import { exerciseText } from "@src/lib/catalog";
```

Replace the temporary `label={ex.id}` from Task 8 Step 1 with:
```tsx
label={exerciseText(ex.id).name}
```

- [ ] **Step 11: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS. Every consumer of the old text fields now reads via `exerciseText()`.

- [ ] **Step 12: Commit**

```bash
git add \
  /Users/lion/Documents/Projects/mine/fitness/exercises.json \
  /Users/lion/Documents/Projects/mine/fitness/locales \
  app/scripts/extract-exercise-text.ts \
  app/scripts/sync-data.sh \
  app/src/types/catalog.ts \
  app/src/lib/catalog.ts \
  app/src/lib/prompt.ts \
  app/src/lib/runner.ts \
  app/app/plan/preview/ \
  app/app/plan/generate.tsx \
  app/src/i18n/locales/en/exercises.json \
  app/src/i18n/locales/uk/exercises.json \
  app/assets/data/exercises.json
git commit -m "feat(i18n): split exercise text out of structural catalog"
```

---

## Task 11: Wire setLanguage to i18n.changeLanguage and notification reschedule

**Files:**
- Modify: `app/src/store/settingsStore.ts`
- Modify: `app/app/_layout.tsx`

- [ ] **Step 1: Make `setLanguage` a side-effecting action**

Edit `app/src/store/settingsStore.ts`. Add imports at the top:

```ts
import { i18n, resolveLanguage } from "@src/i18n";
import { usePlanStore } from "@src/store/planStore";
import { rescheduleAll } from "@src/lib/scheduler";
```

Replace `setLanguage: (l) => set({ language: l }),` with:

```ts
setLanguage: async (l) => {
  set({ language: l });
  await i18n.changeLanguage(resolveLanguage(l));
  const plan = usePlanStore.getState().plan;
  if (plan) {
    rescheduleAll(plan).catch(() => {});
  }
},
```

And update the interface:

```ts
setLanguage: (l: LanguagePref) => Promise<void>;
```

Note: there's a circular risk — `settingsStore` now imports `planStore`, `scheduler`, and `i18n`. Verify this doesn't cause a module-cycle at runtime. If it does, the fix is to wrap the scheduler/plan read in a dynamic `import()` inside `setLanguage`. Try the direct import first; if typecheck passes and the app boots, it's fine.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/src/store/settingsStore.ts
git commit -m "feat(i18n): wire setLanguage to i18n.changeLanguage and reschedule"
```

---

## Task 12: Populate Ukrainian common.json

**Files:**
- Modify: `app/src/i18n/locales/uk/common.json`

- [ ] **Step 1: Populate `app/src/i18n/locales/uk/common.json`**

Replace the empty `{}` with the full Ukrainian translation. Every key from `en/common.json` must appear. Translations below are natural Ukrainian; feel free to polish wording but keep the key structure identical.

```json
{
  "app": {
    "loading": "Завантаження…",
    "notFound": "Не знайдено"
  },
  "tabs": {
    "plan": "План",
    "settings": "Налаштування"
  },
  "wizard": {
    "continue": "Продовжити",
    "back": "← Назад",
    "skip": "Пропустити",
    "stepOf": "Крок {{current}} з {{total}}"
  },
  "onboarding": {
    "welcome": {
      "title": "Ласкаво просимо",
      "subtitle": "Домашні тренування, що вписуються у твій робочий день.\nБез обладнання. Нагадує рухатися. Переживає будь-які зустрічі.",
      "cta": "Почати"
    },
    "name": {
      "title": "Як тебе називати?",
      "subtitle": "Досить імʼя — буде у привітаннях.",
      "placeholder": "Твоє імʼя"
    },
    "photo": {
      "title": "Додати фото профілю?",
      "subtitle": "Необовʼязково. Показується на головному екрані.",
      "choose": "Вибрати з галереї",
      "replace": "Замінити фото",
      "remove": "Видалити",
      "pickError": "Не вдалося вибрати фото"
    },
    "dob": {
      "title": "Коли ти народився?",
      "subtitle": "Використовується для підбору вправ за віком."
    },
    "body": {
      "title": "Кілька параметрів тіла",
      "subtitle": "Потрібно для розрахунку калорій під час тренувань.",
      "weightLabel": "Вага (кг)",
      "weightPlaceholder": "напр. 75",
      "weightError": "Від 20 до 300 кг",
      "heightLabel": "Зріст (см)",
      "heightPlaceholder": "напр. 178",
      "heightError": "Від 100 до 250 см"
    },
    "fitnessLevel": {
      "title": "Який у тебе рівень підготовки?",
      "subtitle": "Впливає на складність вправ і темп прогресу."
    },
    "goals": {
      "title": "Чого ти хочеш досягти?",
      "subtitle": "Обери одну або декілька цілей. Це формує структуру плану.",
      "finish": "Завершити налаштування"
    }
  },
  "dashboard": {
    "hello": "Привіт",
    "friend": "друже",
    "restDay": "День відпочинку",
    "restDaySubtitle": "Відновлюйся, пий воду, піднімись сходами, якщо є настрій.",
    "allSessionsToday": "ВСІ СЕСІЇ НА СЬОГОДНІ",
    "caloriesToday": "КАЛОРІЇ СЬОГОДНІ",
    "emptyTitle": "Плану ще немає",
    "emptySubtitle": "Створи персональний план зі своїми цілями, розкладом і обмеженнями. Займе близько хвилини.",
    "generateCta": "Створити план"
  },
  "upNext": {
    "eyebrow": "ДАЛІ",
    "rightNow": "ЗАРАЗ",
    "inMinutes": "ЧЕРЕЗ {{minutes}} ХВ",
    "startsAt": "ПОЧАТОК О {{time}}",
    "start": "Почати",
    "postpone": "Відкласти"
  },
  "dayStrip": {
    "today": "СЬОГОДНІ",
    "rest": "Відпочинок"
  },
  "settings": {
    "title": "Налаштування",
    "sections": {
      "profile": "ПРОФІЛЬ",
      "appearance": "ВИГЛЯД",
      "reminders": "НАГАДУВАННЯ ТА ПОЛІРУВАННЯ",
      "postpone": "ВІДКЛАДЕННЯ",
      "language": "МОВА"
    },
    "profileRow": {
      "label": "Профіль користувача",
      "notSet": "Не задано"
    },
    "planRow": {
      "edit": "Редагувати план",
      "editSubtitle": "Оновити розклад і перегенерувати",
      "generate": "Створити план",
      "generateSubtitle": "Створи свій перший план тренувань"
    },
    "theme": "Тема",
    "themeOptions": {
      "system": "Системна",
      "light": "Світла",
      "dark": "Темна"
    },
    "notifications": {
      "label": "Сповіщення",
      "subtitle": "Нагадування про перерви та тренування"
    },
    "haptics": {
      "label": "Вібрація",
      "subtitle": "Вібрація після підходу і повторень"
    },
    "audio": {
      "label": "Звукові сигнали",
      "subtitle": "Сигнали зворотного відліку під час тренувань"
    },
    "keepAwake": {
      "label": "Не вимикати екран під час тренування",
      "subtitle": "Щоб екран не згасав, коли ти тренуєшся"
    },
    "postponeBy": "Відкласти на",
    "postponeHint": "Використовується, коли ти натискаєш «Відкласти» на картці поточної сесії.",
    "postponeMinutes_one": "{{count}} хв",
    "postponeMinutes_few": "{{count}} хв",
    "postponeMinutes_many": "{{count}} хв",
    "postponeMinutes_other": "{{count}} хв",
    "language": {
      "label": "Мова",
      "system": "Системна",
      "english": "English",
      "ukrainian": "Українська"
    },
    "clearAll": "Очистити всі дані",
    "confirmReset": {
      "title": "Очистити все?",
      "body": "Це видалить твій профіль, поточний план і весь прогрес.",
      "confirm": "Очистити",
      "cancel": "Скасувати",
      "finalTitle": "Справді все очистити?",
      "finalBody": "Цю дію неможливо скасувати.",
      "finalConfirm": "Так, очистити все"
    }
  },
  "profileEdit": {
    "changePhoto": "Змінити фото",
    "sections": {
      "dob": "ДАТА НАРОДЖЕННЯ",
      "body": "ТІЛО",
      "fitnessLevel": "РІВЕНЬ ПІДГОТОВКИ",
      "goals": "ЦІЛІ"
    },
    "nameLabel": "Імʼя",
    "weightLabel": "Вага (кг)",
    "heightLabel": "Зріст (см)",
    "save": "Зберегти",
    "validationTitle": "Перевір введені дані",
    "validationBody": "Імʼя, вага, зріст і щонайменше одна ціль обовʼязкові.",
    "photoErrorTitle": "Не вдалося зберегти фото"
  },
  "plan": {
    "generate": {
      "title": "Параметри плану",
      "subtitle": "Кілька деталей про твій робочий день, щоб план вписався в реальне життя.",
      "sections": {
        "timeBudget": "ДЕННИЙ ЛІМІТ ЧАСУ",
        "workHours": "РОБОЧІ ГОДИНИ",
        "meetingDensity": "ЗАВАНТАЖЕНІСТЬ ЗУСТРІЧАМИ",
        "lunchBreak": "ОБІДНЯ ПЕРЕРВА",
        "limitations": "ОБМЕЖЕННЯ",
        "disliked": "ВПРАВИ, ЯКІ НЕ ПОДОБАЮТЬСЯ",
        "period": "ПЕРІОД"
      },
      "timeBudgetValue": "{{minutes}} хв / день",
      "timeBudgetHint": "Основне тренування + перерви разом.",
      "workStart": "Початок",
      "workEnd": "Кінець",
      "meetingDensityHint": "Наскільки завантажений твій типовий день?",
      "lunchToggle": "Я роблю обідню перерву",
      "yes": "Так",
      "no": "Ні",
      "limitationsHint": "Є щось із цього? Познач усе, що стосується. Вправи з відповідними протипоказаннями буде виключено.",
      "dislikedHint": "Вправи, які ніколи не включати. Торкнися, щоб змінити.",
      "dislikedCount": "(показано перші {{shown}} з {{total}})",
      "buildPrompt": "Сформувати промпт",
      "promptReady": "Твій промпт готовий",
      "promptReadySubtitle": "Скопіюй його, встав у Claude (або інший LLM) і поверни JSON-відповідь сюди.",
      "copyToClipboard": "Копіювати промпт у буфер",
      "copied": "Скопійовано!",
      "havePlan": "План готовий — вставити його",
      "backToForm": "Назад до форми",
      "buildErrorTitle": "Не вдалося сформувати промпт"
    },
    "paste": {
      "title": "Встав свій план",
      "subtitle": "Встав JSON, який згенерував LLM. Ми перевіримо його за схемою та переконаємось, що кожна вправа є у каталозі.",
      "placeholder": "Встав JSON сюди…",
      "pasteFromClipboard": "Вставити з буфера",
      "validate": "Перевірити",
      "errorsFound_one": "Знайдено {{count}} помилку",
      "errorsFound_few": "Знайдено {{count}} помилки",
      "errorsFound_many": "Знайдено {{count}} помилок",
      "errorsFound_other": "Знайдено {{count}} помилок",
      "moreErrors": "… і ще {{count}}.",
      "looksGood": "✓ Усе гаразд",
      "save": "Зберегти план",
      "stats": {
        "period": "Період",
        "days": "Днів",
        "daysValue": "{{total}} ({{active}} активних)",
        "sessions": "Сесій",
        "exercisesTotal": "Усього вправ",
        "estimatedCalories": "Розрахунок калорій",
        "estimatedCaloriesValue": "{{min}}–{{max}} ккал"
      }
    },
    "preview": {
      "notFound": "Сесію не знайдено.",
      "start": "Почати тренування",
      "back": "Назад",
      "watchOut": "Уникай: {{mistakes}}",
      "unknownExercise": "Невідома вправа: {{id}}",
      "rounds_one": "{{count}} раунд",
      "rounds_few": "{{count}} раунди",
      "rounds_many": "{{count}} раундів",
      "rounds_other": "{{count}} раундів",
      "exerciseMeta": "{{sets}} × {{amount}} · відпочинок {{rest}}с · ~{{kcal}} ккал"
    }
  },
  "workout": {
    "sessionNotFound": "Сесію не знайдено.",
    "getReady": "ПРИГОТУЙСЯ",
    "rest": "ВІДПОЧИНОК",
    "upNext": "Далі: {{name}}",
    "setOf": "ПІДХІД {{current}} З {{total}}",
    "roundOf": "РАУНД {{current}}/{{total}} · ",
    "setsProgress": "{{done}} / {{total}} підходів",
    "done": "Готово",
    "skip": "Пропустити",
    "skipRest": "Пропустити відпочинок",
    "exit": {
      "title": "Вийти з тренування?",
      "body": "Твій прогрес буде збережено.",
      "keepGoing": "Продовжити",
      "confirm": "Вийти"
    },
    "summary": {
      "title": "Молодець!",
      "kcal": "Фактичні калорії",
      "kcalValue": "{{kcal}} ккал",
      "duration": "Тривалість",
      "durationValue": "{{min}} хв",
      "completed": "Виконано вправ",
      "completion": "Завершення сесії",
      "completionValue": "{{pct}}%",
      "cta": "Готово"
    },
    "units": {
      "reps_one": "{{count}} повторення",
      "reps_few": "{{count}} повторення",
      "reps_many": "{{count}} повторень",
      "reps_other": "{{count}} повторень",
      "seconds": "{{count}}с",
      "metersClimbed": "{{count}} м підйому",
      "secondsSublabel": "секунд",
      "repsSublabel": "повторень · натисни «Готово», коли закінчиш",
      "metersSublabel": "метрів підйому"
    }
  },
  "notifications": {
    "title": "Час для: {{sessionType}}",
    "body": "{{duration}} хв · ~{{kcal}} ккал · вікно закривається о {{windowClose}}"
  },
  "errors": {
    "permissionDeniedTitle": "Дозвіл відхилено",
    "permissionDeniedBody": "Увімкни сповіщення у системних налаштуваннях, щоб отримувати нагадування."
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/src/i18n/locales/uk/common.json
git commit -m "feat(i18n): add Ukrainian common translations"
```

---

## Task 13: Populate Ukrainian enums.json

**Files:**
- Modify: `app/src/i18n/locales/uk/enums.json`

- [ ] **Step 1: Populate `app/src/i18n/locales/uk/enums.json`**

Replace `{}` with:

```json
{
  "goals": {
    "belly_fat": "Позбутися жиру на животі",
    "weight_loss": "Схуднення",
    "posture": "Краща постава",
    "core_strength": "Сила корпусу",
    "cardiovascular_health": "Здоровʼя серця",
    "flexibility": "Гнучкість",
    "general_fitness": "Загальна форма",
    "muscle_tone": "Тонус мʼязів",
    "stress_relief": "Зняття стресу"
  },
  "limitations": {
    "none": "Немає",
    "lower_back_pain": "Біль у попереку",
    "lower_back_injury": "Травма попереку",
    "knee_pain": "Біль у колінах",
    "knee_injury": "Травма коліна",
    "wrist_pain": "Біль у запʼястях",
    "wrist_injury": "Травма запʼястя",
    "shoulder_pain": "Біль у плечах",
    "shoulder_injury": "Травма плеча",
    "neck_injury": "Травма шиї",
    "elbow_injury": "Травма ліктя",
    "ankle_injury": "Травма щиколотки",
    "hip_injury": "Травма стегна",
    "high_blood_pressure": "Підвищений тиск",
    "balance_issues": "Проблеми з балансом",
    "vertigo": "Запаморочення",
    "pregnancy_late_term": "Пізня вагітність"
  },
  "fitnessLevels": {
    "beginner": "Початковий",
    "intermediate": "Середній",
    "advanced": "Просунутий"
  },
  "fitnessLevelDescriptions": {
    "beginner": "Ти новачок або повертаєшся після тривалої перерви.",
    "intermediate": "Тренуєшся кілька разів на тиждень, знаєш основи.",
    "advanced": "Регулярні структуровані тренування, впевнено тримаєш техніку."
  },
  "meetingDensity": {
    "low": "Мало — рідкі зустрічі, довгі блоки фокусу",
    "medium": "Середньо — звичайний календар",
    "high": "Багато — зустріч за зустріччю"
  },
  "sessionTypes": {
    "main_workout": "Основне тренування",
    "desk_break": "Перерва біля столу",
    "stair_cardio": "Кардіо сходами",
    "stretching": "Розтяжка"
  },
  "priorities": {
    "required": "Обовʼязково",
    "preferred": "Бажано",
    "optional": "За бажанням"
  },
  "intensities": {
    "low": "Низька",
    "medium": "Середня",
    "high": "Висока"
  },
  "blockTypes": {
    "warmup": "Розминка",
    "main": "Основна",
    "cooldown": "Заминка",
    "circuit": "Кругове"
  },
  "periodTypes": {
    "weekly": "Тиждень",
    "monthly": "Місяць",
    "custom": "Власний"
  },
  "bodyParts": {
    "neck": "Шия",
    "shoulders": "Плечі",
    "upper_back": "Верх спини",
    "lower_back": "Поперек",
    "obliques": "Косі мʼязи",
    "core": "Корпус",
    "chest": "Груди",
    "arms": "Руки",
    "legs": "Ноги",
    "glutes": "Сідниці",
    "hips": "Стегна",
    "full_body": "Все тіло"
  },
  "contraindications": {
    "lower_back_injury": "Травма попереку",
    "lower_back_pain": "Біль у попереку",
    "knee_injury": "Травма коліна",
    "knee_pain": "Біль у колінах",
    "wrist_injury": "Травма запʼястя",
    "wrist_pain": "Біль у запʼястях",
    "shoulder_injury": "Травма плеча",
    "shoulder_pain": "Біль у плечах",
    "neck_injury": "Травма шиї",
    "elbow_injury": "Травма ліктя",
    "ankle_injury": "Травма щиколотки",
    "hip_injury": "Травма стегна",
    "high_blood_pressure": "Підвищений тиск",
    "balance_issues": "Проблеми з балансом",
    "vertigo": "Запаморочення",
    "pregnancy_late_term": "Пізня вагітність"
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/src/i18n/locales/uk/enums.json
git commit -m "feat(i18n): add Ukrainian enum translations"
```

---

## Task 14: Populate Ukrainian exercise translations

**Files:**
- Modify: `locales/uk/exercises.json` (project root at `/Users/lion/Documents/Projects/mine/fitness/locales/uk/exercises.json`)

The extractor in Task 10 wrote a stub at `locales/uk/exercises.json` with every exercise id mapped to empty strings. This task fills them in with actual Ukrainian translations.

There are 75 exercises. Writing all 75 translations inline in this plan would make it unmanageable. The approach:

1. Open `locales/en/exercises.json` side-by-side with `locales/uk/exercises.json`.
2. Translate each exercise's `name`, `instructions[]`, `common_mistakes[]`, `modifications.easier`, `modifications.harder`, and `notes` from English to Ukrainian.
3. Keep the key structure identical to the English version.
4. Leave `notes: null` as `null` (do not convert `null` to empty string).

For the subagent executing this task: **produce the Ukrainian translations exercise-by-exercise**. Use natural fitness terminology; do not transliterate English terms unless they are standard in Ukrainian fitness content (e.g., "бурпі" is acceptable for "burpee", "планка" for "plank").

- [ ] **Step 1: Verify the stub structure**

```bash
cat /Users/lion/Documents/Projects/mine/fitness/locales/uk/exercises.json | head -40
```

Expected: a JSON object with exercise ids as keys and objects with empty-string values for `name`, `instructions` (array of empty strings matching the English array length), `common_mistakes`, `modifications.easier`, `modifications.harder`, and `notes` (either `null` or `""` matching the English).

- [ ] **Step 2: Translate each exercise**

Open `/Users/lion/Documents/Projects/mine/fitness/locales/en/exercises.json` for reference and fill in the Ukrainian at `/Users/lion/Documents/Projects/mine/fitness/locales/uk/exercises.json`.

Example (from English to Ukrainian) for `neck-rolls`:

```json
{
  "neck-rolls": {
    "name": "Кругові рухи шиєю",
    "instructions": [
      "Сядь або встань рівно, плечі розслаблені.",
      "Опусти підборіддя до грудей.",
      "Повільно перекоти голову до правого плеча, потім назад, ліворуч і вперед, роблячи плавне коло.",
      "Після повного оберту зміни напрямок."
    ],
    "common_mistakes": [
      "Занадто сильне закидання голови назад",
      "Затримка дихання",
      "Підтягнуті плечі"
    ],
    "modifications": {
      "easier": "Тільки півкола (від плеча до плеча, без заднього кроку)",
      "harder": "Затримуйся у кожному положенні на 3 секунди"
    },
    "notes": null
  }
}
```

Produce translations for all 75 exercises. Preserve array length exactly: if English `instructions` has 4 strings, Ukrainian must have 4 strings.

- [ ] **Step 3: Re-run sync-data.sh to mirror into the app bundle**

```bash
cd /Users/lion/Documents/Projects/mine/fitness/app
./scripts/sync-data.sh
```

Expected: `app/src/i18n/locales/uk/exercises.json` updates to match the project-root file.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS. (JSON-only change.)

- [ ] **Step 5: Commit**

```bash
git add /Users/lion/Documents/Projects/mine/fitness/locales/uk/exercises.json app/src/i18n/locales/uk/exercises.json
git commit -m "feat(i18n): add Ukrainian exercise translations"
```

---

## Task 15: Add validate-locales script and wire into prestart

**Files:**
- Create: `app/scripts/validate-locales.ts`
- Modify: `app/package.json`

- [ ] **Step 1: Create `app/scripts/validate-locales.ts`**

```ts
// Build-time check that every locale file has the same keys as English and
// that every exercise id in the structural catalog has a matching entry in
// both en and uk exercises.json. Fails the build on drift.
//
// Run: npx tsx scripts/validate-locales.ts

import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_ROOT = path.resolve(__dirname, '..');
const LOCALES = path.join(APP_ROOT, 'src', 'i18n', 'locales');
const LANGS = ['en', 'uk'] as const;
const NAMESPACES = ['common', 'enums', 'exercises'] as const;

type Issue = string;
const issues: Issue[] = [];

function loadJson(p: string): unknown {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function collectKeys(obj: unknown, prefix = ''): Set<string> {
  const out = new Set<string>();
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    if (prefix) out.add(prefix);
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const sub of collectKeys(v, key)) out.add(sub);
    } else {
      out.add(key);
    }
  }
  return out;
}

// 1) common + enums: key-set parity across en/uk
for (const ns of ['common', 'enums'] as const) {
  const enPath = path.join(LOCALES, 'en', `${ns}.json`);
  const ukPath = path.join(LOCALES, 'uk', `${ns}.json`);
  const en = collectKeys(loadJson(enPath));
  const uk = collectKeys(loadJson(ukPath));
  for (const k of en) {
    if (!uk.has(k)) issues.push(`[${ns}] missing in uk: ${k}`);
  }
  for (const k of uk) {
    if (!en.has(k)) issues.push(`[${ns}] orphan in uk (not in en): ${k}`);
  }
}

// 2) exercises: every id in structural catalog has en+uk text with required shape
const catalog = loadJson(path.join(APP_ROOT, 'assets', 'data', 'exercises.json')) as {
  exercises: Array<{ id: string }>;
};
const enEx = loadJson(path.join(LOCALES, 'en', 'exercises.json')) as Record<string, unknown>;
const ukEx = loadJson(path.join(LOCALES, 'uk', 'exercises.json')) as Record<string, unknown>;

const REQUIRED_FIELDS = [
  'name',
  'instructions',
  'common_mistakes',
  'modifications',
  'notes',
] as const;

function hasShape(entry: unknown): string[] {
  if (!entry || typeof entry !== 'object') return ['(not an object)'];
  const problems: string[] = [];
  const e = entry as Record<string, unknown>;
  for (const f of REQUIRED_FIELDS) {
    if (!(f in e)) problems.push(`missing '${f}'`);
  }
  if (e.instructions !== undefined && !Array.isArray(e.instructions)) {
    problems.push(`'instructions' must be an array`);
  }
  if (e.common_mistakes !== undefined && !Array.isArray(e.common_mistakes)) {
    problems.push(`'common_mistakes' must be an array`);
  }
  if (
    e.modifications !== undefined &&
    (typeof e.modifications !== 'object' ||
      e.modifications === null ||
      !('easier' in e.modifications) ||
      !('harder' in e.modifications))
  ) {
    problems.push(`'modifications' must have easier+harder`);
  }
  return problems;
}

for (const ex of catalog.exercises) {
  if (!(ex.id in enEx)) issues.push(`[exercises] missing in en: ${ex.id}`);
  else {
    const p = hasShape(enEx[ex.id]);
    for (const m of p) issues.push(`[exercises] en.${ex.id}: ${m}`);
  }
  if (!(ex.id in ukEx)) issues.push(`[exercises] missing in uk: ${ex.id}`);
  else {
    const p = hasShape(ukEx[ex.id]);
    for (const m of p) issues.push(`[exercises] uk.${ex.id}: ${m}`);
  }
}

for (const id of Object.keys(enEx)) {
  if (!catalog.exercises.find((x) => x.id === id)) {
    issues.push(`[exercises] orphan in en (not in catalog): ${id}`);
  }
}
for (const id of Object.keys(ukEx)) {
  if (!catalog.exercises.find((x) => x.id === id)) {
    issues.push(`[exercises] orphan in uk (not in catalog): ${id}`);
  }
}

if (issues.length > 0) {
  console.error(`validate-locales: ${issues.length} issue(s) found:`);
  for (const issue of issues) console.error(`  - ${issue}`);
  process.exit(1);
}

console.log(`validate-locales: OK (${catalog.exercises.length} exercises, ${LANGS.length} languages, ${NAMESPACES.length} namespaces)`);
```

- [ ] **Step 2: Update `app/package.json` scripts**

Edit the `"scripts"` block. Change `"prestart"` and add a `"validate-locales"` entry:

```json
{
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "web": "expo start --web",
    "lint": "expo lint",
    "sync-data": "./scripts/sync-data.sh",
    "typecheck": "tsc --noEmit",
    "validate-locales": "tsx scripts/validate-locales.ts",
    "prestart": "./scripts/sync-data.sh && tsx scripts/validate-locales.ts"
  }
}
```

Also add `tsx` as a devDependency:

```bash
cd /Users/lion/Documents/Projects/mine/fitness/app
npm install --save-dev tsx
```

- [ ] **Step 3: Run the validator**

```bash
npm run validate-locales
```

Expected output (if all translations are complete):
```
validate-locales: OK (75 exercises, 2 languages, 3 namespaces)
```

If it fails, fix the reported issues in the locale files and re-run.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/scripts/validate-locales.ts app/package.json app/package-lock.json
git commit -m "feat(i18n): add validate-locales script for build-time drift detection"
```

---

## Task 16: End-to-end smoke test in both languages

**Files:** none (manual verification)

- [ ] **Step 1: Clean-boot the app**

```bash
cd /Users/lion/Documents/Projects/mine/fitness/app
npm run typecheck
npm run validate-locales
npm run start
```

Launch on iOS simulator or device.

- [ ] **Step 2: English smoke path**

Walk through as an English-speaking user (or set device locale to English before launching):

1. Splash → Onboarding Welcome ("Welcome to Fitness")
2. Name → Photo → DOB → Body → Fitness level (verify the three descriptions show) → Goals (select one, "Finish setup")
3. Dashboard → "No plan yet" empty state → "Generate Plan"
4. Generate plan form → fill in defaults → "Build prompt" → "I have my plan — paste it"
5. Paste a valid plan JSON (use the sample weekly plan) → "Validate" → "Save plan"
6. Dashboard now shows sessions → expand session preview → verify exercise name, instructions, common mistakes are in English
7. Start workout → countdown → rep set → rest → timed set → summary screen
8. Back to tabs → Settings → verify every row is English → scroll to "LANGUAGE" section → verify "System / English / Українська" chips

Verify: no key-not-found fallbacks render (no `common:foo.bar` visible), no English-in-Ukrainian leaks.

- [ ] **Step 3: Switch to Ukrainian at runtime**

In Settings, tap "Українська".

Verify: every screen re-renders in Ukrainian without app restart. Verify the Plan tab title ("План"), dashboard greeting ("Привіт"), session cards (Ukrainian session type labels), and exercise text (Ukrainian names).

- [ ] **Step 4: Re-run an existing workout in Ukrainian**

Tap a session → Start Workout → verify countdown ("ПРИГОТУЙСЯ"), set labels ("ПІДХІД 1 З 3"), rest screen ("ВІДПОЧИНОК"), summary ("Молодець!").

- [ ] **Step 5: Plural-rule spot checks**

Verify the following specific count values render correctly in both languages:
- reps count = 1: English "1 rep", Ukrainian "1 повторення"
- reps count = 2: English "2 reps", Ukrainian "2 повторення"
- reps count = 5: English "5 reps", Ukrainian "5 повторень"
- reps count = 21: English "21 reps", Ukrainian "21 повторення"
- rounds count = 1, 2, 5, 21 similar coverage

These show up in the session preview and workout runner.

- [ ] **Step 6: Notification check**

From Settings, ensure notifications are enabled. Let the app schedule notifications for required/preferred sessions (happens on "Save plan"). Force the device clock forward or adjust the session window so a notification fires. Verify the notification title and body are in the currently selected language.

Then switch language in Settings; verify `rescheduleAll()` is called (check the scheduler log or schedule a new plan) and subsequent notifications fire in the new language.

- [ ] **Step 7: Validate-locales sanity**

```bash
npm run validate-locales
```

Expected: `OK (75 exercises, 2 languages, 3 namespaces)`.

- [ ] **Step 8: Final commit (if any follow-up fixes were needed during smoke test)**

If manual testing surfaced a missed string, add it to the appropriate locale file, re-run typecheck + validate-locales, and commit:

```bash
git add <touched files>
git commit -m "fix(i18n): <specific thing fixed during smoke test>"
```

- [ ] **Step 9: Final verification summary**

Print a final check of what's in the repo:

```bash
cd /Users/lion/Documents/Projects/mine/fitness/app
npm run typecheck
npm run validate-locales
git log --oneline main..HEAD
```

Expected: typecheck PASS, validator OK, commit log shows the i18n migration steps.

---

## Self-review summary

**Spec coverage check:**
- Architecture (3 namespaces, bundled JSON, expo-localization) → Task 2 ✓
- `settingsStore` language field + setLanguage → Task 3 (stub) + Task 11 (full wiring) ✓
- Catalog split (exercises.json → structural + locales) → Task 10 ✓
- Prompt merger preserving LLM contract → Task 10 Step 7 ✓
- Enum label migration → Task 4 ✓
- Screen copy migration (onboarding, tabs, plan, workout, settings, profile) → Tasks 6, 7, 8, 9 ✓
- Exercise text via `exerciseText()` helper → Task 10 ✓
- Ukrainian locale files → Tasks 12, 13, 14 ✓
- Language switcher UI in Settings → Task 7 Step 3 ✓
- `rescheduleAll()` on language change → Task 11 ✓
- Build-time validator → Task 15 ✓
- Manual smoke test in both languages + plural spot-checks → Task 16 ✓

**Placeholder scan:** none found. Every code step contains the code to paste, every command step contains the exact command to run.

**Type consistency:** `LanguagePref`, `SupportedLanguage`, `ExerciseText`, `exerciseText(id)`, `initI18n(pref)`, `resolveLanguage(pref)`, and `settings.language / settings.setLanguage()` are consistent across tasks. The naming `resolveLanguage` is used in both Task 2 (`src/i18n/index.ts` export) and Task 11 (`settingsStore` import).

**Known tradeoffs flagged for the implementer:**

1. **`contraindications` stays in structural catalog.** Spec Section 4 originally listed it among removed fields; we keep it because it's an enum-keyed array (not free prose) and the LLM needs it for filtering. Rendered via `enums:contraindications.<key>`. This was corrected in the plan's "File Structure" note.
2. **No test framework.** TypeScript typecheck + `validate-locales` + manual smoke test are our verification loop. Each task ends with a typecheck step.
3. **Task 14 requires actual Ukrainian translation work.** The plan provides the structure and one worked example (`neck-rolls`); the executing agent must produce translations for 75 exercises using the English locale file as reference.
4. **Potential circular import in Task 11.** `settingsStore` importing `planStore` and `scheduler` may introduce a module cycle. If it manifests, the fix is a dynamic `import()` inside `setLanguage`; noted inline in Task 11 Step 1.
