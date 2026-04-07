// Types for the exercise catalog (exercises.json).

import type { DefaultUnit, ExerciseCategory, NoiseLevel } from "./enums";

export type Equipment = "none" | "chair" | "wall" | "stairs" | "doorway";

export interface ExerciseModifications {
  easier: string;
  harder: string;
}

export interface Exercise {
  id: string;
  name: string;
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
  instructions: string[];
  common_mistakes: string[];
  modifications: ExerciseModifications;
  contraindications: string[];
  desk_friendly: boolean;
  noise_level: NoiseLevel;
  notes: string | null;
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
