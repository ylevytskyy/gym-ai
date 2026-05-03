# Exercise Library + TTS Preview

**Date:** 2026-04-15
**Status:** Draft

## Overview

Add a browsable exercise catalog to the app: a new "Exercises" tab that lists all 75 exercises grouped by category, and a detail screen for each exercise with images, instructions, common mistakes, and modifications. The detail screen has a Play button that reads the instructions aloud using the device's text-to-speech engine in the app's currently selected language (en or uk).

This is purely an additive, read-only feature. No changes to the plan, workout runner, or persisted stores.

## Decisions

| Decision | Choice |
|---|---|
| Entry point | New bottom tab `Exercises` alongside Plan / Settings |
| List layout | `SectionList` grouped by category, fixed category order |
| Detail content | Name, image carousel, Play button, instructions, common mistakes, modifications (easier/harder), body-part chips, difficulty dots |
| Play button | Simple toggle — press to speak all steps, press to stop. No pause/resume, no step highlighting, no speed control |
| TTS language | Resolved from `settingsStore.language` via existing `resolveLanguage()` (system → en/uk) |
| TTS engine | `expo-speech` (wraps iOS AVSpeechSynthesizer / Android TextToSpeech) |
| Speaking state | Local to the detail screen, no new store |
| Missing voice fallback | Still attempt; if `uk-UA` absent on Android, show a one-line hint under the button |

## 1. Architecture

```
app/
  (tabs)/
    _layout.tsx        (modified: add Exercises tab)
    exercises.tsx      (new: list screen)
  exercises/
    [id].tsx           (new: detail screen, outside tabs so tab bar hides)

src/
  lib/
    exercise-catalog.ts  (new: loader + category helpers)
    speech.ts            (new: expo-speech wrapper + useSpeech hook)
```

The list and detail screens both read the bundled `assets/data/exercises.json` catalog and the active-language `src/i18n/locales/<lang>/exercises.json` translations. Existing components (`ExerciseImageThumbnail`, `ExerciseImageCarousel`, `Card`, `Chip`, `Screen`) are reused.

## 2. Tab integration

Add a third `Tabs.Screen` entry in `app/(tabs)/_layout.tsx`:

```tsx
<Tabs.Screen
  name="exercises"
  options={{
    title: t('tabs.exercises'),
    tabBarIcon: ({ color, size }) => (
      <Ionicons name="library-outline" size={size} color={color} />
    ),
  }}
/>
```

## 3. List screen — `app/(tabs)/exercises.tsx`

Uses `SectionList` with sections built in a fixed order:

```
desk_break → mobility → flexibility → core →
strength_upper → strength_lower → cardio → stair
```

Category counts (for sizing expectations): desk_break 15, core 12, strength_upper 10, strength_lower 10, cardio 10, stair 8, flexibility 5, mobility 5.

**Section header:** translated category name (from `enums.json`, e.g. `enums.category.desk_break`), small uppercase label style consistent with existing section labels in Settings.

**Row:**
- Left: `ExerciseImageThumbnail` (size 48).
- Middle: localized name (from `exercises:<id>.name`); subtitle = body parts joined by " · " (e.g. "Neck · Upper back"), translated via `enums.json` body-part keys.
- Right: `chevron-forward` icon.
- `Pressable` → `router.push(\`/exercises/\${id}\`)`.

**Empty state:** none needed — catalog is always bundled.

## 4. Detail screen — `app/exercises/[id].tsx`

`expo-router` dynamic route. Reads `id` from `useLocalSearchParams()`, looks up the exercise in the catalog and its translations.

### Language-change behaviour

A `useEffect` watches `activeLang` (resolved from `settingsStore.language`)
and calls `stop()` when it actually changes mid-screen, so a user who
flips Settings while playing instructions doesn't hear English mid-stream
after switching to Ukrainian. The effect tracks the previous language in
a `useRef` and **skips its first run** — opening the screen does not call
`Speech.stop()`, which would otherwise be a no-op but is unnecessary
work and could clip speech started elsewhere.

### Scroll layout top-to-bottom

1. **Header:** standard back chevron (expo-router default or reuse pattern from `plan/preview/[sessionId]`), localized name as title.
2. **Image carousel:** `ExerciseImageCarousel` for `id`.
3. **Play button:** full-width pill, large.
   - Not speaking: icon `volume-high-outline` or `play`, label `t('exercises.playInstructions')`.
   - Speaking: icon `stop`, label `t('exercises.stop')`.
   - Below button, conditionally: `t('exercises.ukVoiceMissing')` hint if active language is `uk` and Android device reports no `uk-UA` voice.
4. **Instructions:** heading `t('exercises.instructionsHeading')`, numbered list (1, 2, 3, …) of steps from the active-language `instructions` array.
5. **Common mistakes:** heading `t('exercises.commonMistakesHeading')`, bulleted list of strings from `common_mistakes`.
6. **Modifications:** heading `t('exercises.modificationsHeading')`, two cards stacked vertically (mobile-first, avoids cramped text on narrow screens):
   - "Easier" — `modifications.easier`
   - "Harder" — `modifications.harder`
   - If a modification string is `null`, omit that card.
7. **Meta row:** body-part chips + difficulty dots (1–5 filled circles). Reuse existing `Chip` component.

The `notes` field is intentionally omitted from V1.

## 5. TTS module — `src/lib/speech.ts`

Thin wrapper around `expo-speech`:

```ts
import * as Speech from 'expo-speech';
import { useEffect, useState, useCallback, useRef } from 'react';
import type { SupportedLanguage } from '@src/i18n';

const BCP47: Record<SupportedLanguage, string> = {
  en: 'en-US',
  uk: 'uk-UA',
};

export async function hasVoiceFor(lang: SupportedLanguage): Promise<boolean> {
  const voices = await Speech.getAvailableVoicesAsync();
  const tag = BCP47[lang].toLowerCase();
  return voices.some((v) => v.language.toLowerCase().startsWith(tag.slice(0, 2)));
}

export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      Speech.stop();
    };
  }, []);

  const speakSteps = useCallback(
    (steps: string[], lang: SupportedLanguage) => {
      Speech.stop();
      if (steps.length === 0) return;
      setSpeaking(true);
      // Chain steps so each finishes before the next starts — gives a natural
      // inter-step pause and surfaces onDone for the last step cleanly.
      let i = 0;
      const speakNext = () => {
        if (!mounted.current || i >= steps.length) {
          if (mounted.current) setSpeaking(false);
          return;
        }
        const step = steps[i++];
        Speech.speak(step, {
          language: BCP47[lang],
          onDone: () => speakNext(),
          onStopped: () => {
            if (mounted.current) setSpeaking(false);
          },
          onError: () => {
            if (mounted.current) setSpeaking(false);
          },
        });
      };
      speakNext();
    },
    [],
  );

  const stop = useCallback(() => {
    Speech.stop();
    setSpeaking(false);
  }, []);

  return { speaking, speakSteps, stop };
}
```

**Behaviour notes:**
- Calling `speakSteps` while already speaking first stops and restarts — safer than relying on the engine's queue, which differs per platform.
- On unmount, the `useEffect` cleanup calls `Speech.stop()` so leaving the detail screen mid-speech silences the engine.
- `onStopped` fires when `Speech.stop()` is called; we treat it the same as done.

## 6. Settings integration

The existing `settings.audioEnabled` toggle is for workout-runner cues. It is **not** gated on here — the Play button is an explicit user action and users expect it to work regardless of passive-cue settings. (If we later decide to gate, one line in `useSpeech` checks the store.)

## 7. i18n additions

### `common.json` (add to both `en/` and `uk/`)

```
tabs.exercises
exercises.listTitle
exercises.playInstructions
exercises.stop
exercises.instructionsHeading
exercises.commonMistakesHeading
exercises.modificationsHeading
exercises.easier
exercises.harder
exercises.ukVoiceMissing
exercises.difficultyLabel
exercises.bodyPartSeparator  (the " · " string, in case a locale wants different punctuation)
```

### `enums.json` (add any missing keys)

- `enums.category.<key>` for all 8 categories: `desk_break`, `mobility`, `flexibility`, `core`, `strength_upper`, `strength_lower`, `cardio`, `stair`.
- `enums.bodyPart.<key>` for every body part referenced in the catalog. Inspect `exercises.json` to enumerate (e.g. neck, shoulders, upper_back, chest, arms, core, hips, glutes, legs, calves, full_body, etc.) — the locale-validator script will flag any missing keys.

The existing `npm run validate-locales` script will enforce parity between `en` and `uk`.

## 8. Package addition

```
npx expo install expo-speech
```

`expo install` resolves the version compatible with the project's Expo SDK 54. No native config changes are required (no new permissions).

## 9. Testing

**Type and lint:**
- `npm run typecheck` — clean.
- `npm run validate-locales` — clean.

**Manual (iOS and Android):**
1. Tap the Exercises tab → 8 sections render in the fixed order, category counts match catalog.
2. Tap a row → detail screen loads with correct name, images, instructions, mistakes, modifications.
3. Press Play → hears instructions in current language; button swaps to Stop.
4. Press Stop mid-speech → silence, button reverts.
5. Navigate back during playback → speech stops.
6. Rapid-tap Play several times → no overlapping voices.
7. Switch language in Settings to Ukrainian → return to a detail screen → press Play → hears Ukrainian (iOS: Lesya voice; Android: depends on device).
8. On an Android device without `uk-UA` voice → hint text appears, pressing Play still invokes the engine (falls back to default voice).
9. Exercise with `null` in `modifications.easier` or `.harder` → that card is omitted; the other renders.

## 10. Out of scope (V1)

- Search / filter inside the list.
- Favorites / bookmarking.
- Step-by-step highlighting during speech.
- Speech rate / voice picker in settings.
- Gating speech on the existing `audioEnabled` setting.
- Web support — `expo-speech` does run on web (`window.speechSynthesis`), but we don't test or ship web in this app (the notification scheduler already precludes web SSR).
