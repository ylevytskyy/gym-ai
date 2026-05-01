# Exercise Image Generation & Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full pipeline for generating exercise illustration prompts, splitting comic-strip images into individual steps, and displaying them in the app via a thumbnail-strip carousel and inline thumbnails.

**Architecture:** Three layers — (1) offline scripts for prompt generation and image splitting, (2) a manifest + require-map for Metro-compatible asset loading, (3) two React Native components (`ExerciseImageCarousel`, `ExerciseImageThumbnail`) integrated into workout, session cards, and up-next views.

**Tech Stack:** TypeScript (Expo/React Native), Python 3 + Pillow (image splitting), expo-image, Zustand, i18next

---

### Task 1: Prompt Generation Script

**Files:**
- Create: `scripts/generate-image-prompts.ts`

This script reads exercise data and generates one `.txt` prompt file per exercise, ready to paste into Google Gemini.

- [ ] **Step 1: Create the directory structure**

```bash
mkdir -p scripts/exercise-images/prompts scripts/exercise-images/raw
```

- [ ] **Step 2: Write the prompt generation script**

```typescript
// scripts/generate-image-prompts.ts
//
// Reads exercises.json + en/exercises.json and outputs one .txt prompt
// per exercise to scripts/exercise-images/prompts/.
//
// Usage: npx tsx scripts/generate-image-prompts.ts

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const EXERCISES_PATH = path.join(ROOT, "assets/data/exercises.json");
const TRANSLATIONS_PATH = path.join(
  ROOT,
  "src/i18n/locales/en/exercises.json",
);
const OUTPUT_DIR = path.join(ROOT, "scripts/exercise-images/prompts");

const STYLE_BLOCK = `Style requirements:
- Illustrated cartoon style, clean vector-like look
- Gender-neutral abstract human figure with simplified features, no specific ethnicity
- White/transparent background
- Each panel is a perfect square
- Consistent character size and proportions across all panels
- Thin gray vertical lines separating panels
- No text, labels, numbers, or annotations anywhere in the image
- Clean outlines, flat colors, minimal shading
- Show the figure from the angle that best demonstrates the movement`;

interface CatalogJson {
  exercises: Array<{ id: string }>;
}

interface ExerciseTranslation {
  name: string;
  instructions: string[];
}

const catalog: CatalogJson = JSON.parse(
  fs.readFileSync(EXERCISES_PATH, "utf-8"),
);
const translations: Record<string, ExerciseTranslation> = JSON.parse(
  fs.readFileSync(TRANSLATIONS_PATH, "utf-8"),
);

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

let generated = 0;

for (const exercise of catalog.exercises) {
  const t = translations[exercise.id];
  if (!t) {
    console.warn(`SKIP ${exercise.id} — no English translation found`);
    continue;
  }

  const steps = t.instructions;
  const panels = steps
    .map((desc, i) => `${i + 1}. ${desc}`)
    .join("\n");

  const prompt = `Create a single horizontal comic-strip illustration showing the exercise "${t.name}" in ${steps.length} sequential panels from left to right, separated by thin vertical dividers.

Panels (left to right):
${panels}

${STYLE_BLOCK}`;

  const outPath = path.join(OUTPUT_DIR, `${exercise.id}.txt`);
  fs.writeFileSync(outPath, prompt, "utf-8");
  generated++;
}

console.log(`Generated ${generated} prompts in ${OUTPUT_DIR}`);
```

- [ ] **Step 3: Run the script and verify output**

```bash
npx tsx scripts/generate-image-prompts.ts
```

Expected: `Generated 75 prompts in scripts/exercise-images/prompts`

Verify a sample prompt:

```bash
cat scripts/exercise-images/prompts/standard-push-ups.txt
```

Expected output should contain the exercise name, 4 numbered panels matching the push-up instructions, and the style block.

- [ ] **Step 4: Add scripts/exercise-images/ to .gitignore**

Add to `.gitignore`:

```
# Exercise image generation (raw files are large, prompts are regenerable)
scripts/exercise-images/raw/
scripts/exercise-images/prompts/
```

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-image-prompts.ts .gitignore
git commit -m "feat: add exercise image prompt generation script"
```

---

### Task 2: Image Manifest and Placeholder

**Files:**
- Create: `assets/data/exercise-images.json`
- Create: `assets/images/exercises/placeholder.png` (user-provided)
- Create: `src/lib/exerciseImages.ts`
- Create: `src/lib/exerciseImageMap.ts`

Set up the manifest, image lookup module, and placeholder so components can be built against the loading infrastructure before any real images exist.

- [ ] **Step 1: Create the empty manifest**

```json
{
  "version": "1.0.0",
  "exercises": {}
}
```

Save to `assets/data/exercise-images.json`.

- [ ] **Step 2: Create the placeholder image**

Generate a placeholder silhouette image in Google Gemini with this prompt:

```
A simple gender-neutral human silhouette standing in a neutral pose, illustrated cartoon style,
clean vector-like look, flat gray color (#CCCCCC), white background, no text or labels,
square aspect ratio, minimal design.
```

Save the downloaded image as `assets/images/exercises/placeholder.png` (resize to 400x400px).

If the image is not ready yet, create a temporary 400x400 gray square as a stand-in so the build works:

```bash
python3 -c "
from PIL import Image
img = Image.new('RGBA', (400, 400), (204, 204, 204, 255))
img.save('assets/images/exercises/placeholder.png')
"
```

- [ ] **Step 3: Create the exercise image map module**

This file will be auto-generated by the splitting script later, but we need a stub now so components can import it.

```typescript
// src/lib/exerciseImageMap.ts
//
// AUTO-GENERATED by scripts/split-exercise-images.py — do not edit manually.
// Maps exerciseId → array of require() sources for each step image.

import { ImageSource } from "expo-image";

const placeholder = require("../../assets/images/exercises/placeholder.png");

const map: Record<string, ImageSource[]> = {
  // Will be populated by the splitting script, e.g.:
  // "standard-push-ups": [
  //   require("../../assets/images/exercises/standard-push-ups/step-1.png"),
  //   require("../../assets/images/exercises/standard-push-ups/step-2.png"),
  //   ...
  // ],
};

export function getExerciseStepImages(exerciseId: string): ImageSource[] | null {
  return map[exerciseId] ?? null;
}

export function getPlaceholderImage(): ImageSource {
  return placeholder;
}
```

- [ ] **Step 4: Create the exercise images helper module**

```typescript
// src/lib/exerciseImages.ts
//
// Public API for exercise image loading. Components import this module
// instead of touching the image map or manifest directly.

import { ImageSource } from "expo-image";
import {
  getExerciseStepImages,
  getPlaceholderImage,
} from "./exerciseImageMap";

export interface ExerciseImageInfo {
  hasImages: boolean;
  stepCount: number;
  /** Returns the image source for a given step (0-indexed). Falls back to placeholder. */
  getStep(stepIndex: number): ImageSource;
  /** Returns all step images, or [placeholder] if none exist. */
  allSteps(): ImageSource[];
}

export function getExerciseImages(exerciseId: string): ExerciseImageInfo {
  const steps = getExerciseStepImages(exerciseId);
  const placeholder = getPlaceholderImage();

  if (!steps || steps.length === 0) {
    return {
      hasImages: false,
      stepCount: 0,
      getStep: () => placeholder,
      allSteps: () => [placeholder],
    };
  }

  return {
    hasImages: true,
    stepCount: steps.length,
    getStep: (i) => steps[i] ?? placeholder,
    allSteps: () => steps,
  };
}
```

- [ ] **Step 5: Commit**

```bash
git add assets/data/exercise-images.json assets/images/exercises/placeholder.png \
  src/lib/exerciseImageMap.ts src/lib/exerciseImages.ts
git commit -m "feat: add exercise image manifest, placeholder, and loading infrastructure"
```

---

### Task 3: Image Splitting Script

**Files:**
- Create: `scripts/split-exercise-images.py`

Python script that splits comic-strip images into individual step images and regenerates the TypeScript image map.

- [ ] **Step 1: Write the splitting script**

```python
#!/usr/bin/env python3
"""
Split comic-strip exercise images into individual step panels.

Usage:
  python scripts/split-exercise-images.py                # process all raw images
  python scripts/split-exercise-images.py neck-rolls      # process specific exercise

Reads:  scripts/exercise-images/raw/{id}.png
Writes: assets/images/exercises/{id}/step-{n}.png
Updates: assets/data/exercise-images.json
Generates: src/lib/exerciseImageMap.ts
"""

import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "scripts" / "exercise-images" / "raw"
OUTPUT_DIR = ROOT / "assets" / "images" / "exercises"
MANIFEST_PATH = ROOT / "assets" / "data" / "exercise-images.json"
EXERCISES_PATH = ROOT / "assets" / "data" / "exercises.json"
TRANSLATIONS_PATH = ROOT / "src" / "i18n" / "locales" / "en" / "exercises.json"
IMAGE_MAP_PATH = ROOT / "src" / "lib" / "exerciseImageMap.ts"
STEP_SIZE = 400  # output square size in px
DIVIDER_THRESHOLD = 15  # max pixel std-dev to count as divider column


def load_expected_steps() -> dict[str, int]:
    """Return {exercise_id: expected_step_count} from translations."""
    with open(TRANSLATIONS_PATH) as f:
        translations = json.load(f)
    return {eid: len(t["instructions"]) for eid, t in translations.items()}


def find_dividers(img_array: np.ndarray, min_gap: int = 5) -> list[int]:
    """Find x-coordinates of vertical divider lines by detecting low-variance columns."""
    # Convert to grayscale if needed
    if img_array.ndim == 3:
        gray = np.mean(img_array[:, :, :3], axis=2)
    else:
        gray = img_array

    h, w = gray.shape
    # Compute std-dev of each column
    col_std = np.std(gray, axis=0)

    # Find columns below threshold (uniform color = divider or whitespace)
    divider_mask = col_std < DIVIDER_THRESHOLD

    # Group consecutive divider columns, take center of each group
    dividers = []
    in_divider = False
    start = 0
    for x in range(w):
        if divider_mask[x] and not in_divider:
            in_divider = True
            start = x
        elif not divider_mask[x] and in_divider:
            in_divider = False
            center = (start + x) // 2
            # Skip dividers too close to edges
            if center > min_gap and center < w - min_gap:
                dividers.append(center)

    return dividers


def split_image(img: Image.Image, expected_steps: int) -> list[Image.Image]:
    """Split a comic-strip image into individual panels."""
    arr = np.array(img)
    dividers = find_dividers(arr)

    # If divider detection found the right number of splits, use them
    if len(dividers) == expected_steps - 1:
        edges = [0] + dividers + [img.width]
        panels = []
        for i in range(len(edges) - 1):
            left = edges[i]
            right = edges[i + 1]
            panel = img.crop((left, 0, right, img.height))
            panels.append(panel)
        return panels

    # Fallback: equal-width splitting
    print(f"  Divider detection found {len(dividers)} dividers, expected {expected_steps - 1}. Using equal-width fallback.")
    panel_width = img.width // expected_steps
    panels = []
    for i in range(expected_steps):
        left = i * panel_width
        right = left + panel_width if i < expected_steps - 1 else img.width
        panel = img.crop((left, 0, right, img.height))
        panels.append(panel)
    return panels


def process_exercise(exercise_id: str, expected_steps: int) -> int | None:
    """Process a single exercise. Returns step count on success, None on failure."""
    raw_path = RAW_DIR / f"{exercise_id}.png"
    if not raw_path.exists():
        return None

    print(f"Processing {exercise_id}...")
    img = Image.open(raw_path).convert("RGBA")
    panels = split_image(img, expected_steps)

    if len(panels) != expected_steps:
        print(f"  WARNING: got {len(panels)} panels, expected {expected_steps}")

    # Save panels
    out_dir = OUTPUT_DIR / exercise_id
    out_dir.mkdir(parents=True, exist_ok=True)

    for i, panel in enumerate(panels):
        resized = panel.resize((STEP_SIZE, STEP_SIZE), Image.LANCZOS)
        out_path = out_dir / f"step-{i + 1}.png"
        resized.save(out_path, "PNG", optimize=True)

    print(f"  Saved {len(panels)} panels to {out_dir}")
    return len(panels)


def update_manifest(results: dict[str, int]) -> None:
    """Merge results into the exercise-images.json manifest."""
    if MANIFEST_PATH.exists():
        with open(MANIFEST_PATH) as f:
            manifest = json.load(f)
    else:
        manifest = {"version": "1.0.0", "exercises": {}}

    for eid, steps in results.items():
        manifest["exercises"][eid] = {"steps": steps}

    # Sort exercises alphabetically for stable diffs
    manifest["exercises"] = dict(sorted(manifest["exercises"].items()))

    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")

    print(f"Updated manifest with {len(results)} exercises ({len(manifest['exercises'])} total)")


def generate_image_map(manifest: dict) -> None:
    """Generate src/lib/exerciseImageMap.ts with static require() calls."""
    exercises = manifest.get("exercises", {})

    lines = [
        '// AUTO-GENERATED by scripts/split-exercise-images.py — do not edit manually.',
        '// Maps exerciseId → array of require() sources for each step image.',
        '',
        'import { ImageSource } from "expo-image";',
        '',
        'const placeholder = require("../../assets/images/exercises/placeholder.png");',
        '',
        'const map: Record<string, ImageSource[]> = {',
    ]

    for eid in sorted(exercises.keys()):
        step_count = exercises[eid]["steps"]
        requires = ", ".join(
            f'require("../../assets/images/exercises/{eid}/step-{i + 1}.png")'
            for i in range(step_count)
        )
        lines.append(f'  "{eid}": [{requires}],')

    lines += [
        '};',
        '',
        'export function getExerciseStepImages(exerciseId: string): ImageSource[] | null {',
        '  return map[exerciseId] ?? null;',
        '}',
        '',
        'export function getPlaceholderImage(): ImageSource {',
        '  return placeholder;',
        '}',
        '',
    ]

    IMAGE_MAP_PATH.write_text("\n".join(lines))
    print(f"Generated {IMAGE_MAP_PATH}")


def main():
    expected = load_expected_steps()

    # Filter to specific exercise if argument given
    if len(sys.argv) > 1:
        target_ids = sys.argv[1:]
    else:
        target_ids = [p.stem for p in RAW_DIR.glob("*.png")]

    if not target_ids:
        print("No raw images found in", RAW_DIR)
        return

    results: dict[str, int] = {}
    for eid in sorted(target_ids):
        steps = expected.get(eid)
        if steps is None:
            print(f"SKIP {eid} — not found in translations")
            continue
        count = process_exercise(eid, steps)
        if count is not None:
            results[eid] = count

    if results:
        update_manifest(results)

        # Reload manifest to generate complete map
        with open(MANIFEST_PATH) as f:
            full_manifest = json.load(f)
        generate_image_map(full_manifest)

    print(f"Done. Processed {len(results)} exercises.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verify the script parses correctly**

```bash
python3 -c "import scripts; print('ok')" 2>&1 || python3 scripts/split-exercise-images.py --help 2>&1 || echo "Script is standalone, will test with real images"
```

Without any raw images present, running it should produce:

```bash
python3 scripts/split-exercise-images.py
```

Expected: `No raw images found in scripts/exercise-images/raw`

- [ ] **Step 3: Commit**

```bash
git add scripts/split-exercise-images.py
git commit -m "feat: add image splitting script with divider detection and fallback"
```

---

### Task 4: ExerciseImageThumbnail Component

**Files:**
- Create: `src/components/ExerciseImageThumbnail.tsx`

Small preview component used in cards throughout the app.

- [ ] **Step 1: Write the component**

```typescript
// src/components/ExerciseImageThumbnail.tsx

import React from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { useTheme } from "@src/theme/ThemeProvider";
import { getExerciseImages } from "@src/lib/exerciseImages";

interface ExerciseImageThumbnailProps {
  exerciseId: string;
  step?: number;   // 0-indexed, defaults to 0 (first step / starting position)
  size?: number;   // pixel size, defaults to 48
}

export function ExerciseImageThumbnail({
  exerciseId,
  step = 0,
  size = 48,
}: ExerciseImageThumbnailProps) {
  const theme = useTheme();
  const images = getExerciseImages(exerciseId);
  const source = images.getStep(step);

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surfaceAlt,
        },
      ]}
    >
      <Image
        source={source}
        style={{ width: size, height: size, borderRadius: theme.radius.md }}
        contentFit="contain"
        transition={200}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
});
```

- [ ] **Step 2: Verify it compiles**

```bash
npx expo export --platform ios --output-dir /tmp/expo-check-thumb 2>&1 | tail -5
```

If there are TS errors, fix them. Alternatively, a quick typecheck:

```bash
npx tsc --noEmit 2>&1 | grep -i "exerciseImage" || echo "No type errors"
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ExerciseImageThumbnail.tsx
git commit -m "feat: add ExerciseImageThumbnail component"
```

---

### Task 5: ExerciseImageCarousel Component

**Files:**
- Create: `src/components/ExerciseImageCarousel.tsx`

Full thumbnail-strip + detail view component used on the workout screen.

- [ ] **Step 1: Write the component**

```typescript
// src/components/ExerciseImageCarousel.tsx

import React, { useCallback, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image, ImageSource } from "expo-image";
import { useTheme } from "@src/theme/ThemeProvider";
import { getExerciseImages } from "@src/lib/exerciseImages";
import { exerciseText } from "@src/lib/catalog";
import { useTranslation } from "react-i18next";

interface ExerciseImageCarouselProps {
  exerciseId: string;
  activeStep?: number;              // controlled mode (0-indexed)
  onStepChange?: (step: number) => void;
}

const THUMB_SIZE = 52;
const THUMB_GAP = 6;
const DETAIL_SIZE = 220;

export function ExerciseImageCarousel({
  exerciseId,
  activeStep,
  onStepChange,
}: ExerciseImageCarouselProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const images = getExerciseImages(exerciseId);
  const text = exerciseText(exerciseId);

  const [internalStep, setInternalStep] = useState(0);
  const current = activeStep ?? internalStep;

  const allSteps = images.allSteps();
  const instructions = text.instructions;

  const selectStep = useCallback(
    (index: number) => {
      setInternalStep(index);
      onStepChange?.(index);
    },
    [onStepChange],
  );

  const thumbListRef = useRef<FlatList>(null);

  const renderThumb = useCallback(
    ({ item, index }: { item: ImageSource; index: number }) => {
      const isActive = index === current;
      return (
        <Pressable onPress={() => selectStep(index)}>
          <View
            style={[
              styles.thumb,
              {
                borderColor: isActive
                  ? theme.colors.primary
                  : theme.colors.border,
                borderWidth: isActive ? 2 : 1,
                borderRadius: theme.radius.sm,
                backgroundColor: theme.colors.surfaceAlt,
              },
            ]}
          >
            <Image
              source={item}
              style={styles.thumbImage}
              contentFit="contain"
            />
          </View>
        </Pressable>
      );
    },
    [current, theme, selectStep],
  );

  // Don't show thumbnail strip if only placeholder (no real images)
  const showThumbs = images.hasImages && allSteps.length > 1;

  return (
    <View style={styles.container}>
      {showThumbs ? (
        <FlatList
          ref={thumbListRef}
          data={allSteps}
          renderItem={renderThumb}
          keyExtractor={(_, i) => String(i)}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbList}
          ItemSeparatorComponent={() => <View style={{ width: THUMB_GAP }} />}
        />
      ) : null}

      <View
        style={[
          styles.detailContainer,
          {
            backgroundColor: theme.colors.surfaceAlt,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        <Image
          source={allSteps[current] ?? allSteps[0]}
          style={styles.detailImage}
          contentFit="contain"
          transition={150}
        />
      </View>

      {images.hasImages && instructions[current] ? (
        <View style={styles.stepTextContainer}>
          <Text
            style={[styles.stepLabel, { color: theme.colors.primary }]}
          >
            {t("workout.stepOf", {
              current: current + 1,
              total: instructions.length,
            })}
          </Text>
          <Text
            style={[styles.stepText, { color: theme.colors.textMuted }]}
            numberOfLines={3}
          >
            {instructions[current]}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  thumbList: {
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbImage: {
    width: THUMB_SIZE - 6,
    height: THUMB_SIZE - 6,
  },
  detailContainer: {
    width: DETAIL_SIZE,
    height: DETAIL_SIZE,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  detailImage: {
    width: DETAIL_SIZE - 16,
    height: DETAIL_SIZE - 16,
  },
  stepTextContainer: {
    marginTop: 8,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  stepText: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    textAlign: "center",
  },
});
```

- [ ] **Step 2: Add the `workout.stepOf` translation key**

In `src/i18n/locales/en/common.json`, add inside the `workout` object:

```json
"stepOf": "Step {{current}} of {{total}}"
```

In `src/i18n/locales/uk/common.json`, add inside the `workout` object:

```json
"stepOf": "Крок {{current}} з {{total}}"
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit 2>&1 | grep -i "exerciseImage\|Carousel" || echo "No type errors"
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ExerciseImageCarousel.tsx \
  src/i18n/locales/en/common.json src/i18n/locales/uk/common.json
git commit -m "feat: add ExerciseImageCarousel component with thumbnail strip"
```

---

### Task 6: Integrate Carousel into Workout Screen

**Files:**
- Modify: `app/workout/[sessionId].tsx`

Add the carousel to `SetView` and a preview thumbnail to `CountdownView` and `RestView`.

- [ ] **Step 1: Add import at the top of the file**

Add after existing imports in `app/workout/[sessionId].tsx`:

```typescript
import { ExerciseImageCarousel } from "@src/components/ExerciseImageCarousel";
import { ExerciseImageThumbnail } from "@src/components/ExerciseImageThumbnail";
```

- [ ] **Step 2: Add carousel to SetView**

In the `SetView` function, the current layout is (top to bottom): round/set label → exercise name → progress ring → buttons → instructions.

Insert the carousel between the exercise name and the progress ring. Find this block (around line 417):

```typescript
      <View style={{ marginTop: 32 }}>
```

Add the carousel **before** that `<View>`:

```typescript
      <View style={{ marginTop: 16 }}>
        <ExerciseImageCarousel exerciseId={step.exerciseId} />
      </View>

      <View style={{ marginTop: 20 }}>
```

Also change the existing `marginTop: 32` on the progress ring `<View>` to `marginTop: 20` to tighten spacing since the carousel adds height.

- [ ] **Step 3: Add thumbnail to CountdownView**

In the `CountdownView` function, add a thumbnail between the exercise name and the countdown number. Find this block (around line 368):

```typescript
      <Text
        style={{
          color: theme.colors.primary,
          fontSize: 148,
```

Add **before** that `<Text>`:

```typescript
      <View style={{ marginTop: 16 }}>
        <ExerciseImageThumbnail exerciseId={exerciseName} size={80} />
      </View>
```

Wait — `CountdownView` receives `exerciseName` (a string), not `exerciseId`. We need the exercise ID to look up images. Modify the `CountdownView` props to also accept `exerciseId`:

Update the `CountdownView` function signature and the type:

```typescript
function CountdownView({
  number,
  exerciseName,
  exerciseId,
}: {
  number: number;
  exerciseName: string;
  exerciseId: string;
}) {
```

And where `CountdownView` is rendered in the main component (around line 316-317), pass the exercise ID from the current step:

```typescript
          <CountdownView
            number={countdown}
            exerciseName={current.exerciseName}
            exerciseId={current.exIdx >= 0 ? steps[stepIdx]?.exerciseId ?? "" : ""}
          />
```

Actually, the `countdown` step type in `RunnerStep` doesn't have `exerciseId`. We need to look it up. The countdown step has `blockIdx` and `exIdx`. A simpler approach: look ahead in the steps array to find the next `set` step and grab its `exerciseId`.

Add a helper before the return in the main `WorkoutRunner` component:

```typescript
  const currentExerciseId =
    current.kind === "set"
      ? current.exerciseId
      : current.kind === "countdown"
        ? steps.find(
            (s, i) => i >= stepIdx && s.kind === "set",
          )?.exerciseId ?? ""
        : "";
```

Then pass it:

```typescript
          <CountdownView
            number={countdown}
            exerciseName={current.exerciseName}
            exerciseId={currentExerciseId}
          />
```

And in CountdownView, add the thumbnail between the exercise name and the countdown number:

```typescript
      <View style={{ marginTop: 16 }}>
        <ExerciseImageThumbnail exerciseId={exerciseId} size={80} />
      </View>
```

- [ ] **Step 4: Add thumbnail to RestView**

Similarly, `RestView` shows the next exercise name but not its ID. Update `RestView` to accept `nextExerciseId`:

```typescript
function RestView({
  seconds,
  nextName,
  nextExerciseId,
  onSkip,
}: {
  seconds: number;
  nextName: string | null;
  nextExerciseId: string | null;
  onSkip: () => void;
}) {
```

Add after the "Up next: ..." text (around line 514):

```typescript
      {nextExerciseId ? (
        <View style={{ marginTop: 12 }}>
          <ExerciseImageThumbnail exerciseId={nextExerciseId} size={64} />
        </View>
      ) : null}
```

Where `RestView` is rendered in the main component, compute the next exercise ID. The `rest` step type has `nextExerciseName` but no ID. Find the next set step:

```typescript
        const nextExerciseId =
          steps.find((s, i) => i > stepIdx && s.kind === "set")?.exerciseId ?? null;
```

Pass it:

```typescript
          <RestView
            seconds={timerLeft}
            nextName={current.nextExerciseName}
            nextExerciseId={nextExerciseId}
            onSkip={advance}
          />
```

- [ ] **Step 5: Verify it compiles**

```bash
npx tsc --noEmit 2>&1 | grep -i "workout\|Runner\|Set\|Rest\|Countdown" || echo "No type errors"
```

- [ ] **Step 6: Commit**

```bash
git add app/workout/[sessionId].tsx
git commit -m "feat: integrate exercise images into workout screen"
```

---

### Task 7: Integrate Thumbnails into Session Cards

**Files:**
- Modify: `src/components/SessionCard.tsx`
- Modify: `src/components/UpNextCard.tsx`

- [ ] **Step 1: Add thumbnail to SessionCard**

The `SessionCard` currently shows a session-type icon. The session contains multiple exercises, so we show a thumbnail of the first exercise in the session.

However, `SessionCard` receives a `Session` object. We need to extract the first exercise ID from it. A `Session` has `blocks[].exercises[].exercise_id`.

Add import at the top of `SessionCard.tsx`:

```typescript
import { ExerciseImageThumbnail } from "./ExerciseImageThumbnail";
```

In the component body, extract the first exercise ID:

```typescript
  const firstExerciseId = session.blocks[0]?.exercises[0]?.exercise_id ?? null;
```

Replace the icon container `<View style={[styles.iconBg, ...]}>` block (lines 51-64) with:

```typescript
        {firstExerciseId ? (
          <ExerciseImageThumbnail exerciseId={firstExerciseId} size={44} />
        ) : (
          <View
            style={[
              styles.iconBg,
              {
                backgroundColor: theme.colors.surfaceAlt,
                borderRadius: theme.radius.md,
              },
            ]}
          >
            <Ionicons
              name={ICON_BY_TYPE[session.type]}
              size={22}
              color={priorityColor}
            />
          </View>
        )}
```

This shows the first exercise's image if available, falling back to the existing icon.

- [ ] **Step 2: Add thumbnail to UpNextCard**

Add import at the top of `UpNextCard.tsx`:

```typescript
import { ExerciseImageThumbnail } from "./ExerciseImageThumbnail";
```

Extract first exercise ID:

```typescript
  const firstExerciseId = session.blocks[0]?.exercises[0]?.exercise_id ?? null;
```

Add the thumbnail after the title text (after line 44, the session type text), before the metaRow:

```typescript
      {firstExerciseId ? (
        <View style={{ alignItems: "center", marginTop: theme.spacing.md }}>
          <ExerciseImageThumbnail exerciseId={firstExerciseId} size={72} />
        </View>
      ) : null}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit 2>&1 | grep -i "SessionCard\|UpNext" || echo "No type errors"
```

- [ ] **Step 4: Commit**

```bash
git add src/components/SessionCard.tsx src/components/UpNextCard.tsx
git commit -m "feat: add exercise thumbnails to SessionCard and UpNextCard"
```

---

### Task 8: End-to-End Verification

**Files:** None (verification only)

Test the full pipeline with one exercise to confirm everything works.

- [ ] **Step 1: Generate a test prompt**

```bash
npx tsx scripts/generate-image-prompts.ts
cat scripts/exercise-images/prompts/neck-rolls.txt
```

Verify the prompt looks correct — 4 panels for neck-rolls (matching its 4 instruction steps).

- [ ] **Step 2: Generate a test image in Gemini**

Copy the `neck-rolls.txt` prompt, paste into https://gemini.google.com/app, download the generated image, and save it as:

```bash
cp ~/Downloads/gemini-image.png scripts/exercise-images/raw/neck-rolls.png
```

- [ ] **Step 3: Run the splitter**

```bash
python3 scripts/split-exercise-images.py neck-rolls
```

Expected output:
```
Processing neck-rolls...
  Saved 4 panels to assets/images/exercises/neck-rolls
Updated manifest with 1 exercises (1 total)
Generated src/lib/exerciseImageMap.ts
Done. Processed 1 exercises.
```

- [ ] **Step 4: Verify the outputs**

```bash
ls assets/images/exercises/neck-rolls/
# Expected: step-1.png step-2.png step-3.png step-4.png

cat assets/data/exercise-images.json
# Expected: {"version":"1.0.0","exercises":{"neck-rolls":{"steps":4}}}

head -20 src/lib/exerciseImageMap.ts
# Expected: map with neck-rolls entry and 4 require() calls
```

- [ ] **Step 5: Run the app and verify visually**

```bash
npx expo start
```

Navigate to a workout that includes neck-rolls. Verify:
- Thumbnail strip shows 4 small images at the top
- Tapping a thumbnail shows the full image below
- Step text updates to match the selected step
- Other exercises show the gray placeholder silhouette

- [ ] **Step 6: Commit the test exercise images**

```bash
git add assets/images/exercises/neck-rolls/ assets/data/exercise-images.json \
  src/lib/exerciseImageMap.ts
git commit -m "feat: add neck-rolls exercise images (pipeline verification)"
```
