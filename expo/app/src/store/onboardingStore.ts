// In-memory draft for the onboarding wizard. Not persisted.

import { create } from "zustand";
import type { FitnessLevel, Goal, UserProfile } from "@src/types";

export interface OnboardingDraft {
  name: string;
  photo_uri: string | null;
  date_of_birth: string | null; // YYYY-MM-DD
  weight_kg: number | null;
  height_cm: number | null;
  fitness_level: FitnessLevel | null;
  primary_goals: Goal[];
}

interface OnboardingState {
  draft: OnboardingDraft;
  setDraft: (patch: Partial<OnboardingDraft>) => void;
  reset: () => void;
  toProfile: () => UserProfile | null;
}

const initial: OnboardingDraft = {
  name: "",
  photo_uri: null,
  date_of_birth: null,
  weight_kg: null,
  height_cm: null,
  fitness_level: null,
  primary_goals: [],
};

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  draft: initial,
  setDraft: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  reset: () => set({ draft: initial }),
  toProfile: () => {
    const d = get().draft;
    if (
      !d.name ||
      !d.date_of_birth ||
      d.weight_kg == null ||
      d.height_cm == null ||
      !d.fitness_level ||
      d.primary_goals.length === 0
    ) {
      return null;
    }
    return {
      name: d.name,
      date_of_birth: d.date_of_birth,
      weight_kg: d.weight_kg,
      height_cm: d.height_cm,
      fitness_level: d.fitness_level,
      primary_goals: d.primary_goals,
      photo_uri: d.photo_uri,
      work_schedule: null,
      available_minutes_per_day: null,
      limitations: [],
      disliked_exercise_ids: [],
    };
  },
}));
