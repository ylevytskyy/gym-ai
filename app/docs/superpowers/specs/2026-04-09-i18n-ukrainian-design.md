# Internationalization & Ukrainian Localization

**Date:** 2026-04-09
**Status:** Design approved, awaiting implementation plan
**Scope:** Fitness app (`fitness/app/`) and the shared data foundation at the project root.

## Goal

Introduce internationalization (i18n) to the Expo/React Native fitness app and add Ukrainian as a second language alongside English. All user-facing text — including exercise names, instructions, common mistakes, modifications, and contraindications — must be served from a localization dictionary rather than embedded in the exercise catalog schema or hardcoded in screens.

## Non-goals

- Changes to `workout-plan.schema.json` (stays English-keyed).
- Changes to `workout-generator-prompt.md` (LLM contract preserved).
- Localized plan JSON output from the LLM (plans stay English-keyed; rendering is where localization happens).
- Localized `sample-weekly-plan.json` fixture.
- RTL layout support (Ukrainian is LTR).
- Locale-aware date/number formatting. The existing `date-fns` usage and number formatters stay as-is for V1. This can be layered on later without touching this design.
- Additional languages beyond English and Ukrainian. The architecture supports them (drop new files under `locales/<code>/`), but V1 ships en + uk only.

## Decisions (from brainstorming)

1. **Library:** `i18next` + `react-i18next` + `expo-localization`. Chosen for mature plural rules (Ukrainian has `one/few/many/other`), namespaces (splits UI from exercise content), and zero-friction React Native integration.
2. **Language switching UX:** Auto-detect device locale on first launch, with a manual override chip group in Settings (System / English / Українська). Override persists in `settingsStore`.
3. **Catalog restructuring:** Strip all text fields from `exercises.json`. Exercise text lives only in locale files, keyed by exercise id. The LLM prompt merger re-hydrates the English text at prompt-build time so the LLM contract is unchanged.
4. **Scope:** Four buckets — exercise catalog text, enum labels, screen copy, and edge cases (alerts, notifications, validation errors). All in scope.

## Architecture

### Directory layout

Inside the app:

```
fitness/app/src/i18n/
├── index.ts              ← initI18n(), resolveLanguage(), exports `i18n`
├── detect.ts             ← device locale via expo-localization
├── types.ts              ← ExerciseText interface
└── locales/
    ├── en/
    │   ├── common.json       UI strings
    │   ├── enums.json        enum labels (goals, session types, etc.)
    │   └── exercises.json    per-exercise text keyed by id
    └── uk/
        ├── common.json
        ├── enums.json
        └── exercises.json
```

Project root (source of truth for the shared data foundation):

```
fitness/
├── exercises.json               ← structural only, no text
├── workout-plan.schema.json
├── sample-weekly-plan.json
├── workout-generator-prompt.md
├── locales/
│   ├── en/exercises.json        ← source of truth for English exercise text
│   └── uk/exercises.json        ← source of truth for Ukrainian exercise text
└── app/
    └── src/i18n/locales/
        ├── en/{common,enums,exercises}.json
        └── uk/{common,enums,exercises}.json
```

`common.json` and `enums.json` live **only** inside `app/src/i18n/locales/` — they are app-specific. Only `exercises.json` is mirrored from the project root because its keys must stay in lockstep with the catalog.

### Namespaces

Three i18next namespaces per language:

- **`common`** — UI strings (buttons, screens, settings, errors). Hand-maintained.
- **`enums`** — enum-literal labels (goals, limitations, fitness levels, meeting density, session types, priorities, intensities, block types, body parts, contraindications). Hand-maintained.
- **`exercises`** — per-exercise text keyed by exercise id. Derived from the project-root `locales/<lang>/exercises.json`.

### Runtime flow

1. `app/_layout.tsx` calls `initI18n(settingsStore.language)` on mount.
2. `initI18n()` reads the user's preference:
   - `'system'` → device locale via `expo-localization`, falling back to `'en'` if the device isn't set to a supported language.
   - `'en' | 'uk'` → exact language.
3. i18next boots synchronously from bundled JSON (no I/O, no network, no lazy load). First render has the right strings.
4. When the user changes language in Settings, `settingsStore.setLanguage()` → `i18n.changeLanguage()` → React re-renders via `useTranslation()`. A `useEffect` in `_layout.tsx` also triggers `rescheduleAll()` so baked-in notification bodies get rebuilt in the new language.

### Exercise catalog split

**`exercises.json` (project root) — dropped fields:** `name`, `instructions`, `common_mistakes`, `modifications`, `contraindications`, `notes`.

**`exercises.json` (project root) — retained fields:** `id`, `category`, `body_parts`, `equipment`, `difficulty`, `default_unit`, `default_amount`, `default_sets`, `default_rest_seconds`, `met_value`, `seconds_per_rep`, `desk_friendly`, `noise_level`. The top-level `version`, `calorie_model`, and `_comment` stay.

**`locales/<lang>/exercises.json` shape:**

```json
{
  "neck-rolls": {
    "name": "Neck Rolls",
    "instructions": [
      "Sit or stand tall with shoulders relaxed.",
      "Drop chin toward chest.",
      "Slowly roll head to the right shoulder, then back, then left, then forward in a smooth circle.",
      "Reverse direction after each full rotation."
    ],
    "common_mistakes": ["Forcing the head too far back", "Holding breath", "Hunching shoulders"],
    "modifications": {
      "easier": "Half-circles only (chin to shoulder, no backward arc)",
      "harder": "Hold each position for 3 seconds"
    },
    "notes": null
  }
}
```

Note: `contraindications` is a list of enum literals (e.g., `neck_injury`, `vertigo`) — those stay in the structural `exercises.json` and are rendered via `enums:contraindications.<key>`. Only genuinely free-form prose moves to the locale files.

**`src/types/catalog.ts`:** `Exercise` interface loses the six text fields listed above. A new `ExerciseText` interface lives in `src/i18n/types.ts`:

```ts
export interface ExerciseText {
  name: string;
  instructions: string[];
  common_mistakes: string[];
  modifications: { easier: string; harder: string };
  notes: string | null;
}
```

**`src/lib/catalog.ts`:** Gains `exerciseText(id: string): ExerciseText` that returns the current locale's text via `i18next.t('exercises:<id>', { returnObjects: true })` cast to `ExerciseText`.

### Prompt merger

`src/lib/prompt.ts` currently inlines `exercises.json` verbatim. After the split:

```ts
import exercisesStructural from '../../assets/data/exercises.json';
import exercisesTextEn from '../i18n/locales/en/exercises.json';

function buildCatalogForPrompt() {
  return {
    ...exercisesStructural,
    exercises: exercisesStructural.exercises.map((e) => ({
      ...e,
      ...exercisesTextEn[e.id], // name, instructions, common_mistakes, modifications, notes
    })),
  };
}
```

The merged shape is **identical** to today's `exercises.json`, so `workout-generator-prompt.md` is unchanged and the LLM contract is preserved. The LLM still emits English exercise ids, which the app renders in the user's selected language.

## Locale file shapes

### `common.json` (flat-ish, grouped by screen/component)

```json
{
  "app": { "loading": "Loading…", "notFound": "Not found" },
  "onboarding": {
    "welcome": { "title": "Welcome", "cta": "Get started" },
    "name": { "label": "What should we call you?", "placeholder": "Your name" },
    "dob": { "label": "Date of birth" },
    "body": { "heightCm": "Height (cm)", "weightKg": "Weight (kg)" },
    "fitnessLevel": { "title": "How fit are you?" },
    "goals": { "title": "What do you want to achieve?", "pickMultiple": "Pick one or more" },
    "photo": { "title": "Profile photo (optional)", "skip": "Skip" }
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
    "theme": "Theme",
    "themeOptions": { "system": "System", "light": "Light", "dark": "Dark" },
    "notifications": { "label": "Notifications", "subtitle": "Reminders for desk breaks and workouts" },
    "haptics": { "label": "Haptics", "subtitle": "Rumble on rep done, set complete" },
    "audio": { "label": "Audio cues", "subtitle": "Countdown beeps during timed exercises" },
    "keepAwake": { "label": "Keep screen on during workouts", "subtitle": "Prevents dimming while you're lifting" },
    "postponeBy": "Postpone by",
    "postponeHint": "Used when you tap Postpone on an up-next card.",
    "postponeMinutes_one": "{{count}} min",
    "postponeMinutes_few": "{{count}} min",
    "postponeMinutes_many": "{{count}} min",
    "postponeMinutes_other": "{{count}} min",
    "language": { "label": "Language", "system": "System", "english": "English", "ukrainian": "Українська" },
    "clearAll": "Clear all data",
    "confirmReset": {
      "title": "Clear everything?",
      "body": "This deletes your profile, current plan, and all progress.",
      "confirm": "Clear",
      "cancel": "Cancel",
      "finalTitle": "Really clear?",
      "finalBody": "This cannot be undone.",
      "finalConfirm": "Yes, clear everything"
    },
    "profileRow": { "label": "User profile", "notSet": "Not set" },
    "planRow": {
      "edit": "Edit plan",
      "editSubtitle": "Update schedule and re-generate",
      "generate": "Generate plan",
      "generateSubtitle": "Create your first workout plan"
    }
  },
  "plan": {
    "generate": { "title": "Generate a plan", "cta": "Generate" },
    "paste": { "title": "Paste plan JSON", "cta": "Save plan", "invalid": "Invalid plan JSON" },
    "preview": {
      "notFound": "Session not found.",
      "start": "Start Workout",
      "watchOut": "Watch out: {{mistakes}}",
      "unknownExercise": "Unknown exercise: {{id}}",
      "rounds_one": "{{count}} round",
      "rounds_few": "{{count}} rounds",
      "rounds_many": "{{count}} rounds",
      "rounds_other": "{{count}} rounds"
    }
  },
  "workout": {
    "getReady": "GET READY",
    "rest": "REST",
    "upNext": "Up next: {{name}}",
    "setOf": "SET {{current}} OF {{total}}",
    "roundOf": "ROUND {{current}}/{{total}}",
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
      "duration": "Duration",
      "completed": "Exercises completed",
      "completion": "Session completion",
      "cta": "Done"
    },
    "sessionNotFound": "Session not found.",
    "units": {
      "reps_one": "{{count}} rep",
      "reps_few": "{{count}} reps",
      "reps_many": "{{count}} reps",
      "reps_other": "{{count}} reps",
      "seconds": "{{count}}s",
      "meters": "{{count}} m climbed",
      "repsSublabel": "reps · tap Done when finished",
      "metersSublabel": "meters climbed",
      "secondsSublabel": "seconds"
    }
  },
  "notifications": {
    "title": "{{sessionType}} in {{minutes}} min",
    "body": "{{duration}} min · ~{{kcal}} kcal"
  },
  "errors": {
    "permissionDenied": {
      "title": "Permission denied",
      "body": "Enable notifications in your system Settings to get reminders."
    }
  }
}
```

Ukrainian plural forms use i18next's standard `_one / _few / _many / _other` suffixes. CLDR plural rules are enabled via `compatibilityJSON: 'v4'`.

### `enums.json` (mirrors the schema literals)

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
  "fitnessLevels": { "beginner": "Beginner", "intermediate": "Intermediate", "advanced": "Advanced" },
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
  "priorities": { "required": "Required", "preferred": "Preferred", "optional": "Optional" },
  "intensities": { "low": "Low", "medium": "Medium", "high": "High" },
  "blockTypes": { "warmup": "Warmup", "main": "Main", "cooldown": "Cooldown", "circuit": "Circuit" },
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

The existing `*_LABELS` exported records in `src/types/enums.ts` (`GOAL_LABELS`, `LIMITATION_LABELS`, `FITNESS_LEVEL_LABELS`, `MEETING_DENSITY_LABELS`, `SESSION_TYPE_LABELS`, `PRIORITY_LABELS`) are **deleted**. The TypeScript compiler will surface every consumer, and each is migrated to `t('enums:<group>.<key>')`.

The `body_parts` and `contraindications` keys lists above must be derived from the actual values used across all exercises in `exercises.json`; the implementation plan will enumerate them exhaustively.

## Translation helper & consumer patterns

### `src/i18n/index.ts`

```ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import enCommon from './locales/en/common.json';
import enEnums  from './locales/en/enums.json';
import enEx     from './locales/en/exercises.json';
import ukCommon from './locales/uk/common.json';
import ukEnums  from './locales/uk/enums.json';
import ukEx     from './locales/uk/exercises.json';

export const SUPPORTED_LANGUAGES = ['en', 'uk'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];
export type LanguagePref = 'system' | SupportedLanguage;

export function resolveLanguage(pref: LanguagePref): SupportedLanguage {
  if (pref !== 'system') return pref;
  const device = Localization.getLocales()[0]?.languageCode ?? 'en';
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(device)
    ? (device as SupportedLanguage)
    : 'en';
}

export async function initI18n(pref: LanguagePref) {
  await i18n.use(initReactI18next).init({
    lng: resolveLanguage(pref),
    fallbackLng: 'en',
    ns: ['common', 'enums', 'exercises'],
    defaultNS: 'common',
    resources: {
      en: { common: enCommon, enums: enEnums, exercises: enEx },
      uk: { common: ukCommon, enums: ukEnums, exercises: ukEx },
    },
    interpolation: { escapeValue: false },
    returnNull: false,
    compatibilityJSON: 'v4',
  });
  return i18n;
}

export { i18n };
```

### Consumer patterns

**1. Inside React components** — `useTranslation()`:

```tsx
const { t } = useTranslation();
<Text>{t('settings.title')}</Text>
<Text>{t('workout.setsProgress', { done, total })}</Text>
<Text>{t('workout.units.reps', { count: amount })}</Text>
```

**2. Outside React** (e.g., `scheduler.ts`, non-component code paths) — import `i18n` directly:

```ts
import { i18n } from '@src/i18n';

const title = i18n.t('notifications.title', {
  sessionType: i18n.t(`enums:sessionTypes.${session.type}`),
  minutes,
});
```

**3. Exercise text** — `exerciseText(id)` helper in `src/lib/catalog.ts`:

```ts
import { i18n } from '@src/i18n';
import type { ExerciseText } from '@src/i18n/types';

export function exerciseText(id: string): ExerciseText {
  return i18n.t(`exercises:${id}`, { returnObjects: true }) as ExerciseText;
}
```

Consumers (`runner.ts`, `app/plan/preview/[sessionId].tsx`, `app/workout/[sessionId].tsx`) read `exerciseText(id).name` instead of `catEx.name`.

### Language change reactivity

- `useTranslation()` subscribes to i18n events automatically, so every component using it re-renders on `changeLanguage()`.
- For non-React code paths that bake strings into persisted state (notifications), a hook in `_layout.tsx` watches `settingsStore.language` and calls `rescheduleAll()` on change.
- `runner.ts` `RunnerStep.set` no longer embeds `instructions` and `commonMistakes` snapshots at build-time — these become live `t()` / `exerciseText()` lookups in the runner view, so switching language mid-workout renders the new language immediately without losing state.

### Boot ordering

`initI18n()` is async-but-instant (no I/O — all imports are bundled JSON). `app/_layout.tsx` gates the root `<Stack>` on an `initialized` state: kick off `initI18n()` on mount, show the existing loader until it resolves, then render children. Adds ~1 frame; guarantees no flash of untranslated text or key-not-found fallbacks.

## Settings store changes

Add to `src/store/settingsStore.ts`:

```ts
type LanguagePref = 'system' | 'en' | 'uk';

interface SettingsState {
  // ... existing fields ...
  language: LanguagePref;
  setLanguage: (l: LanguagePref) => void;
}

// in the store body:
language: 'system',
setLanguage: (l) => set({ language: l }),
```

The `setLanguage` action additionally:
1. Calls `i18n.changeLanguage(resolveLanguage(l))`.
2. Triggers `rescheduleAll()` so existing notifications get rebuilt in the new language.

## Settings screen changes

Add a new "LANGUAGE" section above or below "APPEARANCE":

```tsx
<Text style={styles.sectionLabel}>{t('settings.sections.language')}</Text>
<Card>
  <Text style={styles.rowTitle}>{t('settings.language.label')}</Text>
  <View style={chipsRow}>
    {(['system', 'en', 'uk'] as const).map((l) => (
      <Chip
        key={l}
        label={t(`settings.language.${l === 'system' ? 'system' : l === 'en' ? 'english' : 'ukrainian'}`)}
        selected={settings.language === l}
        onPress={() => settings.setLanguage(l)}
      />
    ))}
  </View>
</Card>
```

## Data pipeline changes

### `scripts/sync-data.sh`

Extend to also mirror the project-root locale files into the app:

```bash
# existing copies of exercises.json, schema, sample plan, prompt template remain

LOCALES_SRC="$SRC/locales"
LOCALES_DEST="$APP_ROOT/src/i18n/locales"
mkdir -p "$LOCALES_DEST/en" "$LOCALES_DEST/uk"
cp "$LOCALES_SRC/en/exercises.json" "$LOCALES_DEST/en/exercises.json"
cp "$LOCALES_SRC/uk/exercises.json" "$LOCALES_DEST/uk/exercises.json"
```

### `scripts/validate-locales.ts` (new)

Run in `prestart` after `sync-data.sh`. Fails loudly on drift. Checks:

1. For each exercise id in `exercises.json`, both `locales/en/exercises.json` and `locales/uk/exercises.json` contain a matching key with the required shape (`name`, `instructions` array, `common_mistakes` array, `modifications.easier`, `modifications.harder`, `notes`).
2. `common.json` and `enums.json` key sets are identical across `en` and `uk` (recursive deep-key diff). Empty string values are allowed; missing keys are errors.
3. No orphan keys in Ukrainian files that don't exist in English.
4. Reports all drift in one pass (not first-error-and-exit) so translators can fix everything in one go.

Wired into `package.json` scripts:

```json
{
  "scripts": {
    "prestart": "./scripts/sync-data.sh && ts-node scripts/validate-locales.ts",
    "validate-locales": "ts-node scripts/validate-locales.ts"
  }
}
```

## Migration order

Each step leaves the app compilable and runnable.

1. Add `i18next`, `react-i18next`, `expo-localization` to `package.json`.
2. Create `src/i18n/` scaffolding: `index.ts`, `types.ts`, empty locale files under `locales/en/` and `locales/uk/`.
3. Wire `initI18n()` into `app/_layout.tsx` with a splash gate.
4. Migrate enum labels: populate `enums.json`, delete `*_LABELS` consts in `src/types/enums.ts`, let TS errors guide consumer migration.
5. Migrate screen copy: populate `common.json` screen by screen, replacing hardcoded English with `t()` calls. Commit per screen for clean history.
6. Split the exercise catalog: create `locales/en/exercises.json` at project root by extracting text fields; strip text fields from `exercises.json`; update `src/types/catalog.ts`; update `sync-data.sh`; add `exerciseText()` helper; fix `runner.ts`, `preview/[sessionId].tsx`, `workout/[sessionId].tsx`; verify the prompt merger produces a byte-identical prompt to the pre-split version.
7. Add Ukrainian translations: populate `locales/uk/*` files. Bulk of human work; rest is mechanical.
8. Add language switcher UI in Settings, `language` field to `settingsStore`, wire `setLanguage()` → `i18n.changeLanguage()` → `rescheduleAll()`.
9. Add `scripts/validate-locales.ts` and wire into `prestart`.
10. Run manual smoke-test checklist in both languages.

## Testing strategy

No test framework exists in this project today, so verification relies on:

1. **`npm run typecheck`** — proves every consumer of the old catalog/enum shapes has been migrated. After the `Exercise` interface drops text fields and `*_LABELS` consts are deleted, every stale consumer becomes a compile error.
2. **`npm run validate-locales`** — proves locale files are complete and in sync. Runs automatically in `prestart`.
3. **Prompt byte-equality snapshot** — before deleting text from `exercises.json`, capture the current merged prompt output for one representative exercise; after the split, assert the new prompt merger produces byte-identical output.
4. **Manual smoke-test checklist**, run in both languages:
   - Boot fresh → onboarding → enter name, DOB, body, fitness level, goals, photo.
   - Tap "Generate plan" → paste a valid plan JSON → see preview.
   - Open session preview → expand an exercise → see translated name/instructions/common mistakes.
   - Start workout → countdown → timed set → rep set → rest → summary.
   - Return to Settings → switch language → verify every screen reflects the change without restart.
   - Verify plurals at count = 1, 2, 5, 21 (reps, seconds, sets, rounds).
   - Verify notifications render in the current language (schedule one, wait for it, tap it).
   - Verify no English leaks in Ukrainian mode and no raw keys render anywhere.

## Risks

- **Ukrainian plural rules for `count`.** i18next's `compatibilityJSON: 'v4'` uses CLDR plural rules; Ukrainian `one/few/many/other` maps correctly. The smoke checklist explicitly covers 1, 2, 5, 21 to catch regressions.
- **Language change while a notification is scheduled.** Notification bodies are baked in at scheduling time. On `setLanguage()` we call `rescheduleAll()` to rebuild all pending notifications in the new language. Rare event; perf hit is acceptable.
- **Language change mid-workout.** The runner re-reads exercise text via `exerciseText(id)` on every render, so switching language mid-workout just re-renders with new strings. No crash, no lost state.
- **LLM prompt regression.** Mitigated by the byte-equality snapshot in testing strategy item 3.
- **Missing translations shipped to users.** The `validate-locales` script makes this a build-time failure, not a runtime one.
- **`returnObjects: true` for exercise text.** i18next returns the raw object (arrays and all). The `exerciseText(id)` helper wraps it with a typed return so consumers see a stable `ExerciseText` shape and TypeScript surfaces any mismatch.

## Deliverables

- App boots in the device's language (en or uk), defaulting to en for other locales.
- User can switch language in Settings at any time without restart.
- Every user-facing string the user can reach — onboarding, tabs, settings, plan preview, workout runner, notifications, alerts, exercise names/instructions/mistakes/modifications — is localized.
- `exercises.json` contains no user-facing text; all exercise text flows through i18next.
- Build fails loudly if a translation is missing or orphaned.
- LLM prompt contract is preserved; `workout-generator-prompt.md` is unchanged.
