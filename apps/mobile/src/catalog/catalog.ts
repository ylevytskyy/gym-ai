/** The exercise catalog and its English texts, bundled with the app from the repo's contracts. */

import en from '../../../../catalog/locales/en.json';
import catalogData from '../../../../catalog/exercises.json';

export type ExerciseGroup = 'warm_up' | 'lower_body' | 'upper_body' | 'core' | 'cardio';

export interface Exercise {
  id: string;
  group: ExerciseGroup;
  name_key: string;
  level: 1 | 2 | 3;
  unit: 'reps' | 'seconds';
  default: { sets: number; amount: number; rest_seconds: number };
  met: number;
  avoid_if: string[];
  quiet: boolean;
  media: { video: string; poster: string; model: string };
}

export const catalog = catalogData.exercises as Exercise[];
const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
const texts = en as Record<string, string>;

export function exerciseById(id: string): Exercise | undefined {
  return byId.get(id);
}

/** The exercise's name, or a readable form of its id when the catalog does not know it. */
export function exerciseName(id: string): string {
  const exercise = byId.get(id);
  const name = exercise ? texts[exercise.name_key] : undefined;
  return name ?? id.replace(/-/g, ' ');
}

export function exerciseTips(id: string): string | undefined {
  const exercise = byId.get(id);
  return exercise ? texts[exercise.name_key.replace(/\.name$/, '.tips')] : undefined;
}
