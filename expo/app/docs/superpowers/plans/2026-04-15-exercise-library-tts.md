# Exercise Library + TTS Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browsable exercise-library tab and a detail screen with a TTS "Play instructions" button that speaks the instructions in the active app language.

**Architecture:** A new `Exercises` tab renders a `SectionList` of the bundled catalog grouped by category. A new dynamic route `/exercises/[id]` renders a detail screen reusing `ExerciseImageCarousel`. A thin `src/lib/speech.ts` wraps `expo-speech` and exposes a `useSpeech()` hook. All data comes from existing helpers in `src/lib/catalog.ts` and i18n bundles.

**Tech Stack:** Expo SDK 54, expo-router, react-i18next, expo-speech (new), existing Zustand settings store, plain StyleSheet + ThemeProvider.

**Spec:** `docs/superpowers/specs/2026-04-15-exercise-library-tts-design.md`

---

## File Structure

**Create:**
- `src/lib/speech.ts` — `expo-speech` wrapper + `useSpeech()` hook.
- `app/(tabs)/exercises.tsx` — list screen (SectionList).
- `app/exercises/_layout.tsx` — stack layout for the exercises detail route group.
- `app/exercises/[id].tsx` — detail screen.

**Modify:**
- `package.json` — add `expo-speech`.
- `app/(tabs)/_layout.tsx` — register the new `exercises` tab.
- `src/i18n/locales/en/common.json` — add `tabs.exercises`, `exercises.*` keys.
- `src/i18n/locales/uk/common.json` — add the same keys, Ukrainian strings.
- `src/i18n/locales/en/enums.json` — add `exerciseCategories.*` and missing `bodyParts.*` keys.
- `src/i18n/locales/uk/enums.json` — mirror parity.

**No changes to:** stores, plan/workout screens, scheduler, runner.

---

## Task 1: Install expo-speech

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

Run (from `app/` directory):

```bash
npx expo install expo-speech
```

Expected: `package.json` gets an `expo-speech` dependency entry; `node_modules/expo-speech` exists.

- [ ] **Step 2: Verify install**

```bash
grep expo-speech package.json
```

Expected: one line like `"expo-speech": "~14.x.x"` (exact minor depends on SDK 54 resolution).

- [ ] **Step 3: Typecheck still passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json yarn.lock
git commit -m "chore: add expo-speech for instruction playback"
```

---

## Task 2: Add i18n keys for categories and missing body parts (en)

**Files:**
- Modify: `src/i18n/locales/en/enums.json`
- Modify: `src/i18n/locales/en/common.json`

Context: the catalog references body parts not currently in `enums.json`: `abs, ankles, calves, eyes, forearms, hamstrings, hip_flexors, inner_thighs, quads, triceps, wrists`. Category keys (`desk_break`, `mobility`, …) are also missing. The `validate-locales.ts` script enforces parity between `en` and `uk`; we do `en` first, `uk` next task.

- [ ] **Step 1: Add `exerciseCategories` to `src/i18n/locales/en/enums.json`**

Insert as a top-level key (alphabetical ordering is not enforced — add near `sessionTypes`):

```json
"exerciseCategories": {
  "desk_break": "Desk break",
  "mobility": "Mobility",
  "flexibility": "Flexibility",
  "core": "Core",
  "strength_upper": "Upper body strength",
  "strength_lower": "Lower body strength",
  "cardio": "Cardio",
  "stair": "Stairs"
},
```

- [ ] **Step 2: Add missing body-part keys to `bodyParts` in the same file**

The existing `bodyParts` object already has neck, shoulders, upper_back, lower_back, obliques, core, chest, arms, legs, glutes, hips, full_body. Add these missing ones (merge into the same object):

```json
"abs": "Abs",
"ankles": "Ankles",
"calves": "Calves",
"eyes": "Eyes",
"forearms": "Forearms",
"hamstrings": "Hamstrings",
"hip_flexors": "Hip flexors",
"inner_thighs": "Inner thighs",
"quads": "Quads",
"triceps": "Triceps",
"wrists": "Wrists"
```

- [ ] **Step 3: Add new `exercises` and `tabs.exercises` strings to `src/i18n/locales/en/common.json`**

Inside existing `"tabs"` object add one key:

```json
"exercises": "Exercises"
```

Add a new top-level `"exercises"` object at the end of the file (before the closing brace of the root object):

```json
"exercises": {
  "listTitle": "Exercises",
  "playInstructions": "Play instructions",
  "stop": "Stop",
  "instructionsHeading": "Instructions",
  "commonMistakesHeading": "Common mistakes",
  "modificationsHeading": "Modifications",
  "easier": "Easier",
  "harder": "Harder",
  "ukVoiceMissing": "Ukrainian voice not installed on this device — using default voice.",
  "difficultyLabel": "Difficulty",
  "bodyPartSeparator": " · "
}
```

- [ ] **Step 4: Run validate-locales (expected to FAIL because uk not updated yet)**

```bash
npm run validate-locales
```

Expected: reports missing keys in `uk` for the keys we just added. This confirms the script catches the drift — we'll fix in Task 3.

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors (i18n is untyped JSON).

- [ ] **Do NOT commit yet** — the repo is in a half-translated state; wait until Task 3 finishes.

---

## Task 3: Add matching Ukrainian translations

**Files:**
- Modify: `src/i18n/locales/uk/enums.json`
- Modify: `src/i18n/locales/uk/common.json`

- [ ] **Step 1: Add `exerciseCategories` to `src/i18n/locales/uk/enums.json`**

```json
"exerciseCategories": {
  "desk_break": "Перерва за столом",
  "mobility": "Мобільність",
  "flexibility": "Гнучкість",
  "core": "Кор",
  "strength_upper": "Сила верхньої частини тіла",
  "strength_lower": "Сила нижньої частини тіла",
  "cardio": "Кардіо",
  "stair": "Сходи"
},
```

- [ ] **Step 2: Add missing body-part keys to `bodyParts` in the same file**

```json
"abs": "Прес",
"ankles": "Щиколотки",
"calves": "Литки",
"eyes": "Очі",
"forearms": "Передпліччя",
"hamstrings": "Задня поверхня стегна",
"hip_flexors": "Згиначі стегна",
"inner_thighs": "Внутрішня поверхня стегон",
"quads": "Квадрицепси",
"triceps": "Трицепси",
"wrists": "Зап'ястки"
```

- [ ] **Step 3: Add the corresponding strings to `src/i18n/locales/uk/common.json`**

Inside `"tabs"`:

```json
"exercises": "Вправи"
```

Top-level `"exercises"` object (mirror structure):

```json
"exercises": {
  "listTitle": "Вправи",
  "playInstructions": "Відтворити інструкції",
  "stop": "Зупинити",
  "instructionsHeading": "Інструкції",
  "commonMistakesHeading": "Типові помилки",
  "modificationsHeading": "Варіації",
  "easier": "Легше",
  "harder": "Важче",
  "ukVoiceMissing": "Український голос не встановлено на цьому пристрої — використовується стандартний голос.",
  "difficultyLabel": "Складність",
  "bodyPartSeparator": " · "
}
```

- [ ] **Step 4: Validate locales now pass**

```bash
npm run validate-locales
```

Expected: exits 0 with no issues.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit Tasks 2 + 3 together**

```bash
git add src/i18n/locales/en/enums.json src/i18n/locales/en/common.json \
        src/i18n/locales/uk/enums.json src/i18n/locales/uk/common.json
git commit -m "i18n: add exercise-library strings and missing body-part/category keys"
```

---

## Task 4: Create the TTS wrapper and hook

**Files:**
- Create: `src/lib/speech.ts`

- [ ] **Step 1: Create `src/lib/speech.ts` with the full implementation**

```ts
// Thin wrapper around expo-speech. Chains instruction steps so each finishes
// before the next speaks — this gives a natural pause and surfaces onDone
// cleanly. Callers use useSpeech() to get { speaking, speakSteps, stop }.

import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupportedLanguage } from "@src/i18n";

const BCP47: Record<SupportedLanguage, string> = {
  en: "en-US",
  uk: "uk-UA",
};

export function bcp47For(lang: SupportedLanguage): string {
  return BCP47[lang];
}

/**
 * Returns true if the device reports any voice whose BCP-47 tag starts with
 * the target 2-letter code (e.g. "uk"). iOS ships `uk-UA` (Lesya); Android
 * may not have it unless the user has installed Google TTS with Ukrainian.
 */
export async function hasVoiceFor(lang: SupportedLanguage): Promise<boolean> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const prefix = lang.toLowerCase();
    return voices.some((v) => v.language.toLowerCase().startsWith(prefix));
  } catch {
    // If the platform refuses the query, assume the voice exists rather than
    // showing a false-negative warning.
    return true;
  }
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

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/speech.ts
git commit -m "feat: add speech.ts wrapper around expo-speech"
```

---

## Task 5: Register the `Exercises` tab

**Files:**
- Modify: `app/(tabs)/_layout.tsx`

- [ ] **Step 1: Add a third `Tabs.Screen` entry**

Edit `app/(tabs)/_layout.tsx`. The current file has `plan` (index) and `settings` screens. Add a new `exercises` screen between them — order: plan, exercises, settings.

Insert this block between the `index` and `settings` screens:

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

Full updated `<Tabs>` block for reference:

```tsx
<Tabs
  screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: theme.colors.primary,
    tabBarInactiveTintColor: theme.colors.textMuted,
    tabBarStyle: {
      backgroundColor: theme.colors.surface,
      borderTopColor: theme.colors.border,
    },
  }}
>
  <Tabs.Screen
    name="index"
    options={{
      title: t('tabs.plan'),
      tabBarIcon: ({ color, size }) => (
        <Ionicons name="calendar-outline" size={size} color={color} />
      ),
    }}
  />
  <Tabs.Screen
    name="exercises"
    options={{
      title: t('tabs.exercises'),
      tabBarIcon: ({ color, size }) => (
        <Ionicons name="library-outline" size={size} color={color} />
      ),
    }}
  />
  <Tabs.Screen
    name="settings"
    options={{
      title: t('tabs.settings'),
      tabBarIcon: ({ color, size }) => (
        <Ionicons name="settings-outline" size={size} color={color} />
      ),
    }}
  />
</Tabs>
```

- [ ] **Step 2: Do NOT commit yet** — app will error because `app/(tabs)/exercises.tsx` doesn't exist. Continue to Task 6.

---

## Task 6: Build the exercise-list screen

**Files:**
- Create: `app/(tabs)/exercises.tsx`

This screen reads the bundled catalog via existing `src/lib/catalog.ts` helpers and the i18n bundles. Existing helpers: `getCatalog()`, `exerciseText(id)`, `exercisesByCategory(cat)`.

- [ ] **Step 1: Create `app/(tabs)/exercises.tsx`**

```tsx
import React, { useMemo } from "react";
import { SectionList, StyleSheet, Text, View, Pressable } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { Screen } from "@src/components/Screen";
import { ExerciseImageThumbnail } from "@src/components/ExerciseImageThumbnail";
import { useTheme } from "@src/theme/ThemeProvider";
import { getCatalog, exerciseText } from "@src/lib/catalog";
import type { Exercise, ExerciseCategory } from "@src/types";

const CATEGORY_ORDER: ExerciseCategory[] = [
  "desk_break",
  "mobility",
  "flexibility",
  "core",
  "strength_upper",
  "strength_lower",
  "cardio",
  "stair",
];

interface Section {
  title: string; // translated category label
  key: ExerciseCategory;
  data: Exercise[];
}

export default function ExercisesTab() {
  const theme = useTheme();
  const { t } = useTranslation();

  const sections: Section[] = useMemo(() => {
    const catalog = getCatalog();
    const byCat = new Map<ExerciseCategory, Exercise[]>();
    for (const cat of CATEGORY_ORDER) byCat.set(cat, []);
    for (const ex of catalog.exercises) {
      byCat.get(ex.category)?.push(ex);
    }
    return CATEGORY_ORDER
      .map((cat) => ({
        title: t(`enums:exerciseCategories.${cat}`),
        key: cat,
        data: byCat.get(cat) ?? [],
      }))
      .filter((s) => s.data.length > 0);
  }, [t]);

  return (
    <Screen>
      <Text style={[styles.header, { color: theme.colors.text }]}>
        {t("exercises.listTitle")}
      </Text>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text
            style={[styles.sectionLabel, { color: theme.colors.textMuted }]}
          >
            {section.title.toUpperCase()}
          </Text>
        )}
        renderItem={({ item }) => <Row exercise={item} />}
        ItemSeparatorComponent={() => (
          <View
            style={{
              height: 1,
              backgroundColor: theme.colors.border,
              marginLeft: 60,
            }}
          />
        )}
        contentContainerStyle={{ paddingBottom: 32 }}
      />
    </Screen>
  );
}

function Row({ exercise }: { exercise: Exercise }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const text = exerciseText(exercise.id);
  const sep = t("exercises.bodyPartSeparator");
  const subtitle = exercise.body_parts
    .map((p) => t(`enums:bodyParts.${p}`))
    .join(sep);

  return (
    <Pressable
      onPress={() => router.push(`/exercises/${exercise.id}`)}
      style={styles.row}
      android_ripple={{ color: theme.colors.border }}
    >
      <ExerciseImageThumbnail exerciseId={exercise.id} size={48} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text
          style={{ color: theme.colors.text, fontSize: 16, fontWeight: "600" }}
          numberOfLines={1}
        >
          {text.name}
        </Text>
        <Text
          style={{ color: theme.colors.textMuted, fontSize: 12, marginTop: 2 }}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={theme.colors.textMuted}
      />
    </Pressable>
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
});
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit Tasks 5 + 6 together**

```bash
git add app/\(tabs\)/_layout.tsx app/\(tabs\)/exercises.tsx
git commit -m "feat: add Exercises tab with SectionList grouped by category"
```

---

## Task 7: Detail route layout

**Files:**
- Create: `app/exercises/_layout.tsx`

We want the detail screen to live **outside** the tab bar (standard mobile pattern — tab bar hides, header appears). A simple Stack layout at `app/exercises/_layout.tsx` does this because the `exercises/` folder is a sibling of `(tabs)/`.

- [ ] **Step 1: Create `app/exercises/_layout.tsx`**

```tsx
import React from "react";
import { Stack } from "expo-router";
import { useTheme } from "@src/theme/ThemeProvider";

export default function ExercisesLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontWeight: "700" },
      }}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Do NOT commit yet** — the route folder is empty; app will 404. Continue to Task 8.

---

## Task 8: Build the detail screen

**Files:**
- Create: `app/exercises/[id].tsx`

- [ ] **Step 1: Create `app/exercises/[id].tsx`**

```tsx
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { Screen } from "@src/components/Screen";
import { Card } from "@src/components/Card";
import { Chip } from "@src/components/Chip";
import { ExerciseImageCarousel } from "@src/components/ExerciseImageCarousel";
import { useTheme } from "@src/theme/ThemeProvider";
import { exerciseById, exerciseText } from "@src/lib/catalog";
import { useSpeech, hasVoiceFor } from "@src/lib/speech";
import { useSettingsStore } from "@src/store/settingsStore";
import { resolveLanguage } from "@src/i18n";

export default function ExerciseDetailScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const languagePref = useSettingsStore((s) => s.language);
  const activeLang = useMemo(() => resolveLanguage(languagePref), [languagePref]);

  const exercise = id ? exerciseById(id) : undefined;
  const text = id ? exerciseText(id) : undefined;

  const { speaking, speakSteps, stop } = useSpeech();
  const [ukVoiceMissing, setUkVoiceMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (activeLang === "uk") {
      hasVoiceFor("uk").then((has) => {
        if (!cancelled) setUkVoiceMissing(!has);
      });
    } else {
      setUkVoiceMissing(false);
    }
    return () => {
      cancelled = true;
    };
  }, [activeLang]);

  // Stop speech if the user changes language while on this screen.
  useEffect(() => {
    stop();
  }, [activeLang, stop]);

  if (!exercise || !text) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "" }} />
        <Text style={{ color: theme.colors.text, marginTop: 24 }}>
          {t("app.notFound")}
        </Text>
      </Screen>
    );
  }

  const onTogglePlay = () => {
    if (speaking) {
      stop();
    } else {
      speakSteps(text.instructions, activeLang);
    }
  };

  return (
    <Screen scrollable>
      <Stack.Screen options={{ title: text.name }} />

      <View style={{ marginTop: theme.spacing.md }}>
        <ExerciseImageCarousel exerciseId={exercise.id} />
      </View>

      <View style={{ marginTop: theme.spacing.lg }}>
        <Pressable
          onPress={onTogglePlay}
          style={[
            styles.playButton,
            {
              backgroundColor: speaking
                ? theme.colors.surfaceAlt
                : theme.colors.primary,
              borderColor: speaking ? theme.colors.primary : "transparent",
              borderWidth: speaking ? 1 : 0,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            speaking ? t("exercises.stop") : t("exercises.playInstructions")
          }
        >
          <Ionicons
            name={speaking ? "stop" : "volume-high"}
            size={20}
            color={speaking ? theme.colors.primary : "#fff"}
          />
          <Text
            style={{
              marginLeft: 8,
              fontWeight: "700",
              color: speaking ? theme.colors.primary : "#fff",
            }}
          >
            {speaking ? t("exercises.stop") : t("exercises.playInstructions")}
          </Text>
        </Pressable>
        {ukVoiceMissing ? (
          <Text
            style={{
              marginTop: 6,
              fontSize: 12,
              color: theme.colors.textMuted,
            }}
          >
            {t("exercises.ukVoiceMissing")}
          </Text>
        ) : null}
      </View>

      <SectionHeading>{t("exercises.instructionsHeading")}</SectionHeading>
      <Card>
        {text.instructions.map((step, i) => (
          <View key={i} style={styles.numberedRow}>
            <Text style={[styles.number, { color: theme.colors.primary }]}>
              {i + 1}.
            </Text>
            <Text style={{ color: theme.colors.text, flex: 1, lineHeight: 20 }}>
              {step}
            </Text>
          </View>
        ))}
      </Card>

      {text.common_mistakes.length > 0 ? (
        <>
          <SectionHeading>{t("exercises.commonMistakesHeading")}</SectionHeading>
          <Card>
            {text.common_mistakes.map((m, i) => (
              <View key={i} style={styles.bulletRow}>
                <Text style={[styles.bullet, { color: theme.colors.textMuted }]}>
                  •
                </Text>
                <Text style={{ color: theme.colors.text, flex: 1, lineHeight: 20 }}>
                  {m}
                </Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {(text.modifications.easier || text.modifications.harder) ? (
        <>
          <SectionHeading>{t("exercises.modificationsHeading")}</SectionHeading>
          {text.modifications.easier ? (
            <Card>
              <Text
                style={[styles.modLabel, { color: theme.colors.primary }]}
              >
                {t("exercises.easier")}
              </Text>
              <Text
                style={{ color: theme.colors.text, marginTop: 4, lineHeight: 20 }}
              >
                {text.modifications.easier}
              </Text>
            </Card>
          ) : null}
          {text.modifications.harder ? (
            <Card style={{ marginTop: theme.spacing.sm }}>
              <Text
                style={[styles.modLabel, { color: theme.colors.primary }]}
              >
                {t("exercises.harder")}
              </Text>
              <Text
                style={{ color: theme.colors.text, marginTop: 4, lineHeight: 20 }}
              >
                {text.modifications.harder}
              </Text>
            </Card>
          ) : null}
        </>
      ) : null}

      <MetaRow
        bodyParts={exercise.body_parts}
        difficulty={exercise.difficulty}
      />
    </Screen>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Text
      style={{
        color: theme.colors.textMuted,
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 0.8,
        marginTop: 18,
        marginBottom: 6,
      }}
    >
      {typeof children === "string" ? children.toUpperCase() : children}
    </Text>
  );
}

function MetaRow({
  bodyParts,
  difficulty,
}: {
  bodyParts: string[];
  difficulty: number;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <View style={{ marginTop: 18 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {bodyParts.map((p) => (
          <Chip key={p} label={t(`enums:bodyParts.${p}`)} />
        ))}
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginTop: 10,
        }}
      >
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: 12,
            fontWeight: "700",
            letterSpacing: 0.8,
            marginRight: 8,
          }}
        >
          {t("exercises.difficultyLabel").toUpperCase()}
        </Text>
        {[1, 2, 3, 4, 5].map((n) => (
          <View
            key={n}
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              marginRight: 4,
              backgroundColor:
                n <= difficulty ? theme.colors.primary : theme.colors.surfaceAlt,
            }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  playButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 999,
  },
  numberedRow: {
    flexDirection: "row",
    paddingVertical: 6,
  },
  number: {
    fontWeight: "700",
    width: 22,
  },
  bulletRow: {
    flexDirection: "row",
    paddingVertical: 4,
  },
  bullet: {
    width: 16,
    fontSize: 16,
    lineHeight: 20,
  },
  modLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
});
```

Notes on choices in this file:
- `Chip` (`src/components/Chip.tsx`) accepts `label`, optional `selected`, optional `onPress`, optional `color`. We pass only `label` so the chip renders as a static, unselected pill.
- Numbered steps and bullets are rendered inline rather than relying on `FlatList` because the list is always short (≤8 items per section).
- The `app.notFound` key is already in `common.json`.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit Tasks 7 + 8 together**

```bash
git add app/exercises/_layout.tsx app/exercises/\[id\].tsx
git commit -m "feat: add exercise detail screen with TTS play button"
```

---

## Task 9: Manual smoke test

**Files:** none (runtime verification)

- [ ] **Step 1: Sync data and start dev server**

```bash
npm run start
```

Expected: Metro bundler starts without errors.

- [ ] **Step 2: Open on an iOS simulator or device**

Press `i` in the Expo CLI. The app should build. Exercise the following path:

1. Dashboard → bottom tab "Exercises" → list appears with 8 sections.
2. Tap any exercise → detail screen loads with images, instructions, mistakes, modifications, body-part chips, difficulty dots.
3. Tap **Play instructions** → device speaks. Button swaps to **Stop**.
4. Tap **Stop** mid-speech → silence, button reverts.
5. Tap Play, then navigate back before it finishes → speech stops (no ghost voice on the list).
6. Settings → Language → Ukrainian → back to an exercise → Play → Ukrainian voice (iOS: Lesya).
7. On Android: if `ukVoiceMissing` hint appears, pressing Play still plays with the device default; no crash.

Note any failures, fix inline, re-run.

- [ ] **Step 3: Typecheck one more time**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Validate locales**

```bash
npm run validate-locales
```

Expected: clean.

- [ ] **Step 5: No commit required if Step 2 flowed cleanly.** If any fix was needed, commit with:

```bash
git commit -am "fix: <specific issue found during smoke test>"
```

---

## Task 10: Wrap up

**Files:** none

- [ ] **Step 1: Final git log check**

```bash
git log --oneline main..HEAD
```

Expected commits (in order):
1. `chore: add expo-speech for instruction playback`
2. `i18n: add exercise-library strings and missing body-part/category keys`
3. `feat: add speech.ts wrapper around expo-speech`
4. `feat: add Exercises tab with SectionList grouped by category`
5. `feat: add exercise detail screen with TTS play button`
6. (optional) smoke-test fix commits

- [ ] **Step 2: Done.** Open a PR to `main` when the user is ready. No data-layer changes, no schema bump, no notification-scheduler touches.
