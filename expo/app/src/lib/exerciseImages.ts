// src/lib/exerciseImages.ts
//
// Public API for exercise image loading. Components import this module
// instead of touching the image map or manifest directly.

import type { ImageSource } from "expo-image";
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
