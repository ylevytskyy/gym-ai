/**
 * Catalog tools
 * Requirements: 11.1, 11.2, 11.3
 *
 * Read-only access to catalog/exercises.json for the assistant's tool calls
 * and for plan generation.
 */

import { loadRepoJson } from '../repo-files.js';
import type { CatalogFilters, Exercise } from '../types.js';

interface CatalogFile {
  version: string;
  exercises: Exercise[];
}

let cached: Exercise[] | undefined;

/**
 * Load and parse catalog/exercises.json (read once per process).
 * Requirement 11.1: loadCatalog(): Exercise[]
 */
export function loadCatalog(): Exercise[] {
  cached ??= loadRepoJson<CatalogFile>('catalog/exercises.json').exercises;
  // Copy so callers cannot change the cached list.
  return [...cached];
}

/**
 * Return catalog exercises that match every given filter.
 * Requirement 11.2: group (exact match), max_level (<=), exclude_injuries (avoid_if intersection).
 * Requirement 11.3: exclude_injuries builds an injury Set for efficient lookup.
 */
export function getCatalog(filters: CatalogFilters = {}): Exercise[] {
  const excluded = new Set(filters.exclude_injuries ?? []);

  return loadCatalog().filter((ex) => {
    if (filters.group !== undefined && ex.group !== filters.group) return false;
    if (filters.max_level !== undefined && ex.level > filters.max_level) return false;
    if (ex.avoid_if.some((injury) => excluded.has(injury))) return false;
    return true;
  });
}
