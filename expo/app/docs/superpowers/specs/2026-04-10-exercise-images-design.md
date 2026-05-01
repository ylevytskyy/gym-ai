# Exercise Image Generation & Display System

**Date:** 2026-04-10
**Status:** Draft

## Overview

Generate illustrated exercise images for all 75 exercises using Google Gemini's image generation (gemini.google.com), then integrate them into the fitness app as interactive step-by-step carousels.

## Decisions

| Decision | Choice |
|----------|--------|
| Generation tool | Google Gemini (manual UI, no API) |
| Visual style | Illustrated cartoon, clean vector-like |
| Character | Gender-neutral abstract figure, simplified features |
| Background | White/transparent |
| Text on images | None — app handles all text via localization |
| Aspect ratio | Square (1:1) per step |
| Images per exercise | One per instruction step (3-6 steps each, ~300-400 total) |
| Generation strategy | One comic-strip image per exercise, split programmatically |
| App display | Thumbnail strip + detail view with tap navigation |
| Where images appear | Everywhere exercises are mentioned (workout, preview, cards) |
| Missing image fallback | Generic silhouette placeholder |

## 1. Prompt Template

A script generates ready-to-paste prompts for each exercise by filling this template with data from `exercises.json` and `en/exercises.json` translations.

```
Create a single horizontal comic-strip illustration showing the exercise "[EXERCISE_NAME]"
in [N] sequential panels from left to right, separated by thin vertical dividers.

Panels (left to right):
1. [STEP_1_DESCRIPTION]
2. [STEP_2_DESCRIPTION]
3. [STEP_3_DESCRIPTION]
...

Style requirements:
- Illustrated cartoon style, clean vector-like look
- Gender-neutral abstract human figure with simplified features, no specific ethnicity
- White/transparent background
- Each panel is a perfect square
- Consistent character size and proportions across all panels
- Thin gray vertical lines separating panels
- No text, labels, numbers, or annotations anywhere in the image
- Clean outlines, flat colors, minimal shading
- Show the figure from the angle that best demonstrates the movement
```

### Variables

- `[EXERCISE_NAME]`: from `en/exercises.json` → `{id}.name`
- `[N]`: length of `en/exercises.json` → `{id}.instructions` array
- `[STEP_X_DESCRIPTION]`: each entry from the `instructions` array

### Prompt Generation Script

`scripts/generate-image-prompts.ts` reads exercise data and outputs 75 ready-to-paste prompts to `scripts/exercise-images/prompts/`. One `.txt` file per exercise (e.g., `standard-push-ups.txt`).

## 2. Image Splitting Pipeline

### Workflow

1. User pastes prompt into Gemini, downloads generated comic-strip image
2. Saves raw image to `scripts/exercise-images/raw/{exercise-id}.png`
3. Runs splitting script

### Splitting Script

`scripts/split-exercise-images.py` (Python + Pillow):

1. **Load** raw strip image from `scripts/exercise-images/raw/{id}.png`
2. **Detect panels**: Scan for vertical whitespace/divider columns. A column is a divider if its pixel variance is below a threshold (near-uniform white/gray)
3. **Crop** each panel into an individual square image, resized to 400x400px (2x for mobile retina)
4. **Save** to `assets/images/exercises/{id}/step-{n}.png` (1-indexed)
5. **Validate**: Compare number of split panels against expected step count from `exercises.json`. Warn on mismatch.
6. **Fallback**: If divider detection fails, fall back to equal-width splitting (image width / N steps)

### Output Structure

```
assets/images/exercises/
  standard-push-ups/
    step-1.png
    step-2.png
    step-3.png
    step-4.png
  bodyweight-squats/
    step-1.png
    step-2.png
    step-3.png
  ...
```

## 3. Image Manifest

`assets/data/exercise-images.json` tracks which exercises have images:

```json
{
  "version": "1.0.0",
  "placeholder": "assets/images/exercises/placeholder.png",
  "exercises": {
    "standard-push-ups": { "steps": 4 },
    "bodyweight-squats": { "steps": 3 }
  }
}
```

- **Lookup**: App checks `exercises[id]` — if present, load step images. If absent, show placeholder.
- **Updated by**: The splitting script auto-updates this manifest after successful splits.
- **Placeholder**: A single generic silhouette illustration stored at `assets/images/exercises/placeholder.png`. Shown when an exercise has no entry in the manifest.

## 4. App UI Components

### 4.1 ExerciseImageCarousel (new component)

Primary display component used on the workout execution screen.

**Layout:**
- **Thumbnail strip** at top: horizontal row of small square thumbnails (all steps visible)
- **Detail view** below: large square image of the selected step
- **Step text** below detail: instruction text for the selected step from translations
- Active thumbnail highlighted with app primary color (`#ff7a59`)
- Tapping any thumbnail selects that step, updating both the detail image and instruction text

**Props:**
```typescript
interface ExerciseImageCarouselProps {
  exerciseId: string;
  activeStep?: number;        // controlled mode for syncing with workout
  onStepChange?: (step: number) => void;
}
```

**Behavior:**
- Loads step count from `exercise-images.json` manifest
- If exercise not in manifest, renders single placeholder image (no thumbnails)
- Thumbnails are scrollable horizontally if > 5 steps
- Supports both tap navigation and swipe on detail image

### 4.2 ExerciseImageThumbnail (new component)

Small preview component used in cards, lists, and previews throughout the app.

**Props:**
```typescript
interface ExerciseImageThumbnailProps {
  exerciseId: string;
  step?: number;    // which step to show, defaults to 1
  size?: number;    // pixel size, defaults to 48
}
```

**Usage locations:**
- `SessionCard.tsx` — small thumbnail next to exercise name
- `UpNextCard.tsx` — preview of next exercise
- Plan preview / exercise selection screens
- Alternative exercise selection

**Behavior:**
- Shows `step-1.png` by default (the starting position)
- Falls back to placeholder if no images exist
- Uses `expo-image` with caching

### 4.3 Integration Points

**Workout screen** (`app/workout/[sessionId].tsx`):
- Add `ExerciseImageCarousel` above the timer/controls
- Carousel step can optionally auto-advance during timed exercises
- During rest periods, show step-1 of the upcoming exercise as preview

**Exercise browsing** (plan generation, alternatives):
- Add `ExerciseImageThumbnail` to exercise list items
- Tapping an exercise could expand to show the full carousel

**Session cards** (`SessionCard.tsx`, `UpNextCard.tsx`):
- Add small `ExerciseImageThumbnail` for visual recognition

## 5. Image Loading Strategy

- All exercise images are **bundled as static assets** via Metro (not downloaded at runtime)
- Use `expo-image` component for rendering (already in the project)
- `expo-image` provides built-in caching and progressive loading
- Metro requires static `require()` paths at build time — dynamic paths like `require(\`./\${id}/step-\${n}.png\`)` do not work
- A generated mapping module (`src/lib/exerciseImageMap.ts`) provides the bridge:
  - The splitting script auto-generates this file after processing images
  - It exports a lookup: `exerciseId → step number → require() source`
  - Example: `"standard-push-ups": [require("../../assets/images/exercises/standard-push-ups/step-1.png"), ...]`
  - Components import this map instead of constructing paths at runtime
- Total estimated bundle size: ~400 images x ~15KB average = ~6MB added to app bundle

## 6. Generation Workflow Summary

```
1. Run: npx ts-node scripts/generate-image-prompts.ts
   → Outputs 75 .txt files to scripts/exercise-images/prompts/

2. For each exercise:
   a. Copy prompt from .txt file
   b. Paste into Google Gemini
   c. Download generated image
   d. Save to scripts/exercise-images/raw/{exercise-id}.png

3. Run: python scripts/split-exercise-images.py
   → Splits all raw images into individual steps
   → Saves to assets/images/exercises/{id}/step-{n}.png
   → Updates assets/data/exercise-images.json manifest

4. Verify: Check manifest for step count mismatches
   → Re-generate any exercises with bad splits
```

This can be done incrementally — generate a few exercises at a time, run the splitter, and images become available in the app immediately.
