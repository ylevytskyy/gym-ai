# Video-first exercise detail screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The exercise detail screen plays a Blender MP4 when one exists, otherwise shows a body-part-bucketed icon placeholder; the legacy step-PNG slideshow and its entire pipeline are removed.

**Architecture:** A new `prestart` step (`sync-exercise-videos.ts`) auto-discovers MP4s in `assets/exercise-renders/`, validates slugs against the catalog, and emits `src/lib/exerciseVideoMap.generated.ts`. The detail screen swaps `ExerciseImagePlayer` for a new tiny `ExercisePlaceholder` that shares the video player's 220×220 footprint. The old image pipeline (player, wrapper, map, JSON catalog, scripts, asset directories) is deleted in one cleanup task.

**Tech Stack:** TypeScript, Expo Router, expo-video (already in use), Ionicons (already in use), `npx tsx` for build-time scripts (matches `validate-locales.ts`).

**Note on test discipline:** This workspace has no test runner (per `app/CLAUDE.md`). Verification = `pnpm typecheck` + `pnpm lint` + manual run on the simulator. Each task uses a "verify input → implement → verify output" loop with `typecheck` as the cheapest fast feedback signal.

**Spec:** `docs/superpowers/specs/2026-05-06-video-first-exercise-detail-design.md`

---

## File map

**Created:**
- `scripts/sync-exercise-videos.ts` — auto-discovery script.
- `src/lib/exerciseVideoMap.generated.ts` — emitted by the script (committed; matches `prompt-template.generated.ts` convention).
- `src/components/ExercisePlaceholder.tsx` — 220×220 body-part-bucket icon card.

**Modified:**
- `package.json` — add `sync-videos` script; chain it into `prestart`.
- `src/lib/exerciseVideos.ts` — change one import path.
- `app/exercises/[id].tsx` — swap `ExerciseImagePlayer` import + JSX for `ExercisePlaceholder`.

**Deleted:**
- `src/lib/exerciseVideoMap.ts` (replaced by `.generated.ts`).
- `src/components/ExerciseImagePlayer.tsx`.
- `src/lib/exerciseImages.ts` (wrapper, only consumed by the deleted player — verify in Task 5).
- `src/lib/exerciseImageMap.ts` (auto-generated, only consumed by the deleted wrapper — verify in Task 5).
- `assets/data/exercise-images.json` (input to the deleted map — verify in Task 5).
- `assets/images/exercises/` (entire tree).
- `scripts/exercise-images/` (entire dir: `pose-details.json`, `layouts.json`, gitignored `raw/`/`prompts/`).
- `scripts/split-exercise-images.py` (old image pipeline).
- `scripts/generate-image-prompts.ts` (old image pipeline).

**Out of scope (call out, not doing):**
- `GEMINI.md` documents the old pipeline. Updating/removing it is doc work — flag it on the PR but do not change in this plan.
- Wiring the remaining ~43 unrendered exercises (render-pipeline task).
- Rendering quality fixes for known wrong-motion/wrong-position MP4s (render-pipeline task).
- Workout-runner placeholder polish (runner currently renders nothing for missing videos; unchanged here).

---

## Task 1: Add the auto-discovery script and wire prestart

**Files:**
- Create: `scripts/sync-exercise-videos.ts`
- Modify: `package.json` (the `scripts` block)

- [ ] **Step 1: Create `scripts/sync-exercise-videos.ts`**

```typescript
// Build-time check + codegen: scans assets/exercise-renders/ for *.mp4,
// validates each filename's slug (snake → kebab) against the exercise catalog
// in assets/data/exercises.json, and emits src/lib/exerciseVideoMap.generated.ts.
//
// Run: npx tsx scripts/sync-exercise-videos.ts (or `pnpm sync-videos`).

import * as fs from "node:fs";
import * as path from "node:path";

const APP_ROOT = path.resolve(__dirname, "..");
const RENDERS_DIR = path.join(APP_ROOT, "assets", "exercise-renders");
const CATALOG_PATH = path.join(APP_ROOT, "assets", "data", "exercises.json");
const OUTPUT_PATH = path.join(APP_ROOT, "src", "lib", "exerciseVideoMap.generated.ts");

interface CatalogShape {
  exercises: Array<{ id: string }>;
}

function main(): void {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8")) as CatalogShape;
  const validIds = new Set(catalog.exercises.map((e) => e.id));

  const filenames = fs
    .readdirSync(RENDERS_DIR)
    .filter((f) => f.endsWith(".mp4"))
    .sort();

  type Entry = { id: string; filename: string };
  const entries: Entry[] = [];
  const unmatched: string[] = [];

  for (const filename of filenames) {
    const base = filename.replace(/\.mp4$/, "");
    const slug = base.replace(/_/g, "-");
    if (validIds.has(slug)) {
      entries.push({ id: slug, filename });
    } else {
      unmatched.push(filename);
    }
  }

  if (unmatched.length > 0) {
    console.error("✗ Unmatched MP4 filenames in assets/exercise-renders/:");
    for (const f of unmatched) console.error(`  ${f}`);
    console.error(
      "Each .mp4 must derive (snake → kebab) to a valid exercise id in assets/data/exercises.json.",
    );
    process.exit(1);
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));

  const lines: string[] = [
    "// AUTO-GENERATED from assets/exercise-renders/ by scripts/sync-exercise-videos.ts",
    "// Do not edit by hand — re-run: pnpm sync-videos",
    "",
    "const map: Record<string, number> = {",
    ...entries.map(
      (e) =>
        `  ${JSON.stringify(e.id)}: require("../../assets/exercise-renders/${e.filename}"),`,
    ),
    "};",
    "",
    "export function getExerciseVideoSource(exerciseId: string): number | undefined {",
    "  return map[exerciseId];",
    "}",
    "",
  ];

  fs.writeFileSync(OUTPUT_PATH, lines.join("\n"), "utf8");
  console.log(
    `✓ Wrote ${entries.length} entries to ${path.relative(APP_ROOT, OUTPUT_PATH)}`,
  );
}

main();
```

- [ ] **Step 2: Add the `sync-videos` script and chain it into `prestart`**

In `package.json`, modify the `scripts` block. Find:

```json
"sync-data": "./scripts/sync-data.sh",
"typecheck": "tsc --noEmit",
"prestart": "./scripts/sync-data.sh && npx tsx scripts/validate-locales.ts",
"validate-locales": "npx tsx scripts/validate-locales.ts"
```

Replace with:

```json
"sync-data": "./scripts/sync-data.sh",
"sync-videos": "npx tsx scripts/sync-exercise-videos.ts",
"typecheck": "tsc --noEmit",
"prestart": "./scripts/sync-data.sh && npx tsx scripts/sync-exercise-videos.ts && npx tsx scripts/validate-locales.ts",
"validate-locales": "npx tsx scripts/validate-locales.ts"
```

Order matters: `sync-data` must run first (it populates `assets/data/exercises.json`); `sync-videos` must run before `validate-locales` so the generated file exists by the time the locale check (which scans TS files) runs.

- [ ] **Step 3: Run the script and verify output**

```bash
pnpm sync-videos
```

Expected stdout: `✓ Wrote N entries to src/lib/exerciseVideoMap.generated.ts` where N is the count of MP4s currently in `assets/exercise-renders/` (should be ~32 today).

```bash
head -5 src/lib/exerciseVideoMap.generated.ts
```

Expected: header comment, `const map`, an entry like `"bicycle-crunches": require("../../assets/exercise-renders/bicycle_crunches.mp4"),`.

```bash
wc -l src/lib/exerciseVideoMap.generated.ts
```

Expected: roughly `entries + 8` lines (header, blank, map open, entries, map close, blank, function, blank).

- [ ] **Step 4: Sanity-check that all derived slugs match the catalog**

```bash
grep -c '^  "' src/lib/exerciseVideoMap.generated.ts
```

Expected: same N as Step 3.

If the script exited non-zero with "Unmatched MP4 filenames", investigate: either rename the MP4 to match the catalog id (e.g. `bodyweight_squats.mp4` not `squat.mp4`), or update the catalog id, or remove the offending file from `assets/exercise-renders/`. Do not relax the script's validation.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors. (At this point both `exerciseVideoMap.ts` and `exerciseVideoMap.generated.ts` exist; the consumer still imports the old one. That's intentional — Task 2 flips the import.)

- [ ] **Step 6: Commit**

```bash
git add scripts/sync-exercise-videos.ts package.json src/lib/exerciseVideoMap.generated.ts
git commit -m "feat(scripts): auto-discover exercise video map from assets/exercise-renders/"
```

---

## Task 2: Switch the lookup to the generated map

**Files:**
- Modify: `src/lib/exerciseVideos.ts:1` (one line)
- Delete: `src/lib/exerciseVideoMap.ts`

- [ ] **Step 1: Update the import path**

In `src/lib/exerciseVideos.ts`, change line 1 from:

```typescript
import { getExerciseVideoSource } from "./exerciseVideoMap";
```

to:

```typescript
import { getExerciseVideoSource } from "./exerciseVideoMap.generated";
```

The rest of the file (lines 3–5) is unchanged. The public `getExerciseVideo(exerciseId)` API is unchanged, so neither `app/exercises/[id].tsx` nor `app/workout/[sessionId].tsx` need to change.

- [ ] **Step 2: Delete the old hand-edited map**

```bash
git rm src/lib/exerciseVideoMap.ts
```

- [ ] **Step 3: Verify nothing still imports the old file**

```bash
grep -rn "exerciseVideoMap['\"]" src app --include="*.ts" --include="*.tsx"
```

Expected: only matches against `exerciseVideoMap.generated`, no plain `exerciseVideoMap`.

- [ ] **Step 4: Typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/exerciseVideos.ts
git commit -m "feat(exercises): consume auto-generated exerciseVideoMap"
```

---

## Task 3: Add the placeholder component

**Files:**
- Create: `src/components/ExercisePlaceholder.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/ExercisePlaceholder.tsx
//
// Layout-stable stand-in for ExerciseVideoPlayer. Shown on the detail screen
// when an exercise has no Blender render yet. Same 220×220 card, same radius,
// same surfaceAlt background — only the inner content differs (a single
// body-part-bucket icon instead of a video).

import React from "react";
import { StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@src/theme/ThemeProvider";

interface ExercisePlaceholderProps {
  bodyParts: string[];
  size?: number;
}

const BUCKET_BY_BODY_PART: Record<string, string> = {
  // legs
  calves: "legs",
  glutes: "legs",
  hamstrings: "legs",
  hip_flexors: "legs",
  hips: "legs",
  inner_thighs: "legs",
  quads: "legs",
  ankles: "legs",
  // core
  abs: "core",
  core: "core",
  obliques: "core",
  lower_back: "core",
  // upper
  chest: "upper",
  shoulders: "upper",
  triceps: "upper",
  upper_back: "upper",
  forearms: "upper",
  wrists: "upper",
  // full body
  full_body: "full_body",
  // mobility
  neck: "mobility",
  eyes: "mobility",
};

const ICON_BY_BUCKET = {
  legs: "walk-outline",
  core: "body-outline",
  upper: "barbell-outline",
  full_body: "fitness-outline",
  mobility: "accessibility-outline",
} as const;

const FALLBACK_ICON: keyof typeof Ionicons.glyphMap = "fitness-outline";

export function ExercisePlaceholder({
  bodyParts,
  size = 220,
}: ExercisePlaceholderProps) {
  const theme = useTheme();
  const primary = bodyParts[0];
  const bucket = primary ? BUCKET_BY_BODY_PART[primary] : undefined;
  const icon: keyof typeof Ionicons.glyphMap = bucket
    ? ICON_BY_BUCKET[bucket as keyof typeof ICON_BY_BUCKET]
    : FALLBACK_ICON;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: theme.radius.lg,
          backgroundColor: theme.colors.surfaceAlt,
        },
      ]}
    >
      <Ionicons name={icon} size={64} color={theme.colors.textMuted} />
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

Notes for the engineer:
- `theme.radius.lg` and `theme.colors.surfaceAlt` are the same tokens used by `ExerciseVideoPlayer` (see `src/components/ExerciseVideoPlayer.tsx:27-28`) — the placeholder must keep the same shape so swapping it in/out of the JSX causes zero layout shift.
- The default `size` is `220` to match `ExerciseVideoPlayer`'s default.
- Don't add accessibility labels — the surrounding screen already shows the exercise name and body-part chips; the placeholder is decorative.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors. The component compiles standalone even though it isn't used yet.

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ExercisePlaceholder.tsx
git commit -m "feat(exercises): add ExercisePlaceholder for missing-video state"
```

---

## Task 4: Wire the placeholder into the detail screen

**Files:**
- Modify: `app/exercises/[id].tsx:9` (import) and `app/exercises/[id].tsx:75-81` (JSX branch)

- [ ] **Step 1: Swap the import**

In `app/exercises/[id].tsx`, change line 9 from:

```typescript
import { ExerciseImagePlayer } from "@src/components/ExerciseImagePlayer";
```

to:

```typescript
import { ExercisePlaceholder } from "@src/components/ExercisePlaceholder";
```

Line 10's `ExerciseVideoPlayer` import stays untouched.

- [ ] **Step 2: Swap the JSX branch**

In the same file, find the block at lines 75–81:

```tsx
<View style={{ marginTop: theme.spacing.md, alignItems: "center" }}>
  {videoSource !== undefined ? (
    <ExerciseVideoPlayer source={videoSource} />
  ) : (
    <ExerciseImagePlayer exerciseId={exercise.id} />
  )}
</View>
```

Replace the else branch only:

```tsx
<View style={{ marginTop: theme.spacing.md, alignItems: "center" }}>
  {videoSource !== undefined ? (
    <ExerciseVideoPlayer source={videoSource} />
  ) : (
    <ExercisePlaceholder bodyParts={exercise.body_parts} />
  )}
</View>
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Lint**

```bash
pnpm lint
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add app/exercises/[id].tsx
git commit -m "feat(exercises): show body-part-bucket placeholder when no video render"
```

---

## Task 5: Remove the dead old-image pipeline

This task deletes everything that fed the now-unused `ExerciseImagePlayer`. It does the deletions in one shot, gated by a grep that proves nothing else still imports/uses these files.

**Files:**
- Delete: `src/components/ExerciseImagePlayer.tsx`
- Delete: `src/lib/exerciseImages.ts`
- Delete: `src/lib/exerciseImageMap.ts`
- Delete: `assets/data/exercise-images.json`
- Delete: `assets/images/exercises/` (entire directory)
- Delete: `scripts/exercise-images/` (entire directory)
- Delete: `scripts/split-exercise-images.py`
- Delete: `scripts/generate-image-prompts.ts`

- [ ] **Step 1: Verify no live consumers**

Run each of these. Every one MUST return zero matches outside the files being deleted in this task (i.e. nothing in `app/`, nothing in `src/` other than the listed deletions, nothing in `scripts/` other than the listed deletions). If any return matches in untouched code, **STOP** and report — do not proceed.

```bash
grep -rn "ExerciseImagePlayer" app src --include="*.ts" --include="*.tsx"
grep -rwn "exerciseImages" app src --include="*.ts" --include="*.tsx"
grep -rn "getExerciseImages" app src --include="*.ts" --include="*.tsx"
grep -rn "exerciseImageMap" app src --include="*.ts" --include="*.tsx"
grep -rn "exercise-images.json" app src scripts package.json --include="*.ts" --include="*.tsx" --include="*.json"
grep -rn "assets/images/exercises" app src scripts --include="*.ts" --include="*.tsx" --include="*.py" --include="*.sh"
```

Expected — only matches inside the 8 paths listed for deletion above. Any match elsewhere (e.g. in `app/workout/[sessionId].tsx`) is a blocker.

- [ ] **Step 2: Delete the files and directories**

```bash
git rm src/components/ExerciseImagePlayer.tsx
git rm src/lib/exerciseImages.ts
git rm src/lib/exerciseImageMap.ts
git rm assets/data/exercise-images.json
git rm -r assets/images/exercises/
git rm -r scripts/exercise-images/ 2>/dev/null || rm -rf scripts/exercise-images/   # may have untracked subdirs
git rm scripts/split-exercise-images.py
git rm scripts/generate-image-prompts.ts
```

The `2>/dev/null || rm -rf` on `scripts/exercise-images/` covers the case where `raw/`/`prompts/` were gitignored — `git rm -r` only removes tracked files, so the untracked subdirs need a plain `rm -rf` to actually disappear.

- [ ] **Step 3: Typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: both clean. Any TS error here means the grep in Step 1 missed a consumer; revert and investigate.

- [ ] **Step 4: Re-run the video sync to make sure prestart is still healthy**

```bash
pnpm sync-videos
```

Expected: still emits `src/lib/exerciseVideoMap.generated.ts` with the same N entries as Task 1, exits 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(exercises): remove dead step-PNG image pipeline

Replaced by Blender video renders + ExercisePlaceholder. Drops the
ExerciseImagePlayer component, its catalog/map siblings, the asset
tree, and the now-unused image generation scripts."
```

---

## Task 6: Manual verification on the simulator

This is a single sequential checklist — no commits, no code. Walks through the verification matrix from the spec.

**Files:** none (read-only verification)

- [ ] **Step 1: Cold start**

```bash
pnpm start
```

Expected: prestart runs `sync-data.sh`, then `sync-exercise-videos.ts` (prints `✓ Wrote N entries…`), then `validate-locales.ts`. Metro bundler starts.

- [ ] **Step 2: Open the iOS simulator and the Exercises tab**

Press `i` in the Expo terminal to launch the iOS sim. Navigate to the Exercises tab. The list should render normally (this task changed nothing in the list view).

- [ ] **Step 3: Verify the video path**

Open *Bodyweight squats* (id `bodyweight-squats` — has a wired render).

Expected:
- 220×220 card with the squat animation looping silently.
- Looks identical to the pre-change behavior for this exercise.

- [ ] **Step 4: Verify the placeholder path**

Back to the list. Open *Ankle circles* (id `ankle-circles` — no render yet).

Expected:
- Same 220×220 card shape and position as the squat detail.
- Centered `walk-outline` icon (legs bucket — `ankles` is in the legs bucket per the table).
- No flicker, no layout shift relative to a video-having exercise.

- [ ] **Step 5: Spot-check bucket coverage**

Open one exercise per bucket, confirm the icon:

| Exercise (id) | Primary body part | Expected icon |
|---|---|---|
| *Diamond push-ups* (`diamond-push-ups`) | `chest` (upper bucket) | `barbell-outline` |
| *Hollow hold* (`hollow-hold`) | `core` (core bucket) | `body-outline` |
| *Burpees* (`burpees`) | `full_body` (full_body bucket) | `fitness-outline` |
| *Neck rolls* (`neck-rolls`) | `neck` (mobility bucket) | `accessibility-outline` |

If any of the above already has a wired video, the video plays instead — that's not a failure, just pick another exercise from that bucket.

If an icon doesn't match expectation, double-check `BUCKET_BY_BODY_PART` in `src/components/ExercisePlaceholder.tsx` and the exercise's `body_parts[0]` in the catalog.

- [ ] **Step 6: Workout-runner smoke check**

From the dashboard / plan preview, start any session that contains an exercise with a wired video (e.g. *Burpees*, *Bicycle crunches*).

Expected:
- During the work step, the rendered MP4 plays in the runner.
- This confirms the auto-generated map is wired into `app/workout/[sessionId].tsx` via `getExerciseVideo`, which we did not directly modify.

If the runner shows nothing for a known-wired exercise, check that `src/lib/exerciseVideos.ts` was correctly updated in Task 2 (`./exerciseVideoMap.generated`, not `./exerciseVideoMap`).

- [ ] **Step 7: Final summary**

If all six steps above passed, the feature is shippable. Open a PR against `main` with:
- Title: `feat(exercises): video-first detail screen + auto-discovered video map`
- Body: link to the spec at `docs/superpowers/specs/2026-05-06-video-first-exercise-detail-design.md` and call out the `GEMINI.md` doc-update follow-up.

If anything failed, capture the failing step and the observed behavior, and surface back to the user before merging.
