// Loads the bundled exercises.json catalog and provides lookups.

import type { Catalog, Exercise } from "@src/types";
// JSON import works because resolveJsonModule + allowSyntheticDefaultImports
// are both on (via expo/tsconfig.base + our extension).
// The JSON is bundled by Metro so no runtime FS read is needed.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import catalogData from "../../assets/data/exercises.json";

const catalog = catalogData as unknown as Catalog;

// Build an id → Exercise map once.
const byId = new Map<string, Exercise>();
for (const ex of catalog.exercises) {
  byId.set(ex.id, ex);
}

export function getCatalog(): Catalog {
  return catalog;
}

export function exerciseById(id: string): Exercise | undefined {
  return byId.get(id);
}

export function requireExerciseById(id: string): Exercise {
  const ex = byId.get(id);
  if (!ex) throw new Error(`Unknown exercise id: ${id}`);
  return ex;
}

export function allExerciseIds(): string[] {
  return Array.from(byId.keys());
}

export function exercisesByCategory(category: Exercise["category"]): Exercise[] {
  return catalog.exercises.filter((ex) => ex.category === category);
}

export function exercisesForAlternative(
  original: Exercise,
  excludeIds: string[] = [],
): Exercise[] {
  const equipment = new Set(original.equipment);
  return catalog.exercises.filter(
    (e) =>
      e.id !== original.id &&
      !excludeIds.includes(e.id) &&
      e.category === original.category &&
      Math.abs(e.difficulty - original.difficulty) <= 1 &&
      e.equipment.some((eq) => equipment.has(eq)),
  );
}

import { i18n } from "@src/i18n";
import type { ExerciseText } from "@src/i18n/types";

/**
 * Returns the current-locale text for an exercise. Falls back to the
 * exercise id if the translation key is missing so the UI never shows
 * an empty string.
 */
export function exerciseText(id: string): ExerciseText {
  const value = i18n.t(`exercises:${id}`, { returnObjects: true }) as unknown;
  if (!value || typeof value !== "object" || !("name" in value)) {
    return {
      name: id,
      instructions: [],
      common_mistakes: [],
      modifications: { easier: "", harder: "" },
      notes: null,
    };
  }
  return value as ExerciseText;
}
