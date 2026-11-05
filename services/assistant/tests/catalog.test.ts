/**
 * Catalog tools tests
 * Requirements: 11.1, 11.2, 11.3
 */

import { describe, it, expect } from 'vitest';
import { loadCatalog, getCatalog } from '../src/tools/catalog';
import catalogData from '../../../catalog/exercises.json';

describe('loadCatalog', () => {
  it('loads every exercise from catalog/exercises.json', () => {
    const catalog = loadCatalog();
    expect(catalog).toHaveLength(catalogData.exercises.length);
    expect(catalog.map((ex) => ex.id)).toEqual(catalogData.exercises.map((ex) => ex.id));
  });

  it('returns a copy, so callers cannot mutate the cached catalog', () => {
    const first = loadCatalog();
    first.pop();
    expect(loadCatalog()).toHaveLength(catalogData.exercises.length);
  });
});

describe('getCatalog', () => {
  it('returns the full catalog when no filters are given', () => {
    expect(getCatalog()).toHaveLength(catalogData.exercises.length);
    expect(getCatalog({})).toHaveLength(catalogData.exercises.length);
  });

  it('filters by group with an exact match', () => {
    const lower = getCatalog({ group: 'lower_body' });
    expect(lower.length).toBeGreaterThan(0);
    expect(lower.every((ex) => ex.group === 'lower_body')).toBe(true);
    expect(getCatalog({ group: 'lower' })).toEqual([]);
  });

  it('filters by max_level (inclusive)', () => {
    const beginner = getCatalog({ max_level: 1 });
    expect(beginner.length).toBeGreaterThan(0);
    expect(beginner.every((ex) => ex.level <= 1)).toBe(true);
    expect(beginner.length).toBeLessThan(catalogData.exercises.length);
  });

  it('excludes exercises whose avoid_if intersects the given injuries', () => {
    const safe = getCatalog({ exclude_injuries: ['knee_injury'] });
    expect(safe.length).toBeGreaterThan(0);
    expect(safe.some((ex) => ex.avoid_if.includes('knee_injury'))).toBe(false);
    // Exercises unrelated to knees stay available.
    expect(safe.map((ex) => ex.id)).toContain('push-up');
  });

  it('applies several filters together', () => {
    const result = getCatalog({
      group: 'core',
      max_level: 1,
      exclude_injuries: ['lower_back_injury'],
    });
    expect(result).toEqual([]); // both core exercises avoid lower_back_injury
    const coreNoBack = getCatalog({ group: 'core', exclude_injuries: ['shoulder_injury'] });
    expect(coreNoBack.map((ex) => ex.id)).toEqual(['glute-bridge']);
  });
});
