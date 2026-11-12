/**
 * Catalog contract tests: the catalog and its locale file agree with schemas/exercise.schema.json.
 * Requirement 1 (exercise catalog structure)
 */

import { describe, it, expect } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import exerciseSchema from '../../../schemas/exercise.schema.json';
import catalogData from '../../../catalog/exercises.json';
import en from '../../../catalog/locales/en.json';

// Strict mode rejects a schema that uses keywords wrongly, so this also checks the schema itself.
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateExercise = ajv.compile(exerciseSchema);
// A plain boolean: Ajv's type guard would narrow a rejected exercise to `never`.
const isValid = (data: unknown): boolean => validateExercise(data);

describe('exercise schema', () => {
  it('accepts every catalog exercise', () => {
    const failures = catalogData.exercises.flatMap((ex) =>
      isValid(ex) ? [] : [`${ex.id}: ${ajv.errorsText(validateExercise.errors)}`],
    );
    expect(failures).toEqual([]);
  });

  it('takes kebab-case ids and rejects other forms', () => {
    const base = catalogData.exercises[0];
    expect(isValid({ ...base, id: 'reverse-snow-angel' })).toBe(true);
    for (const id of ['reverse_snow_angel', 'Push-up', 'push--up', '-push', 'push-']) {
      expect(isValid({ ...base, id }), id).toBe(false);
    }
  });

  it('keeps met strictly between 1 and 15', () => {
    const base = catalogData.exercises[0];
    expect(isValid({ ...base, met: 1.01 })).toBe(true);
    expect(isValid({ ...base, met: 14.9 })).toBe(true);
    expect(isValid({ ...base, met: 1 })).toBe(false);
    expect(isValid({ ...base, met: 15 })).toBe(false);
  });
});

describe('catalog', () => {
  it('has unique ids', () => {
    const ids = catalogData.exercises.map((ex) => ex.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has an English name, description and tips for every exercise', () => {
    const strings = en as Record<string, string>;
    const missing = catalogData.exercises.flatMap((ex) => {
      const prefix = ex.name_key.replace(/\.name$/, '');
      return [ex.name_key, `${prefix}.description`, `${prefix}.tips`].filter((k) => !strings[k]);
    });
    expect(missing).toEqual([]);
  });
});
