/**
 * Health-day contract tests: schemas/health-day.schema.json accepts the examples in
 * examples/health-days/ and rejects the ones in examples/health-days/invalid/.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { loadRepoJson } from '../src/repo-files';

const examplesDir = join(dirname(fileURLToPath(import.meta.url)), '../../../examples/health-days');

function loadDir(dir: string): Array<{ name: string; data: unknown }> {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({ name, data: JSON.parse(readFileSync(join(dir, name), 'utf8')) as unknown }));
}

// Strict mode rejects a schema that uses keywords wrongly, so this also checks the schema itself.
const ajv = new Ajv2020({ allErrors: true, strict: true });
(addFormats as unknown as (a: Ajv2020) => void)(ajv);
const validate = ajv.compile(loadRepoJson<object>('schemas/health-day.schema.json'));
const isValid = (data: unknown): boolean => validate(data);

describe('health-day schema', () => {
  it('accepts every valid example', () => {
    const examples = loadDir(examplesDir);
    expect(examples.length).toBeGreaterThanOrEqual(3);
    const failures = examples.flatMap(({ name, data }) =>
      isValid(data) ? [] : [`${name}: ${ajv.errorsText(validate.errors)}`],
    );
    expect(failures).toEqual([]);
  });

  it('rejects every invalid example', () => {
    const examples = loadDir(join(examplesDir, 'invalid'));
    expect(examples.length).toBeGreaterThanOrEqual(3);
    const accepted = examples.filter(({ data }) => isValid(data)).map(({ name }) => name);
    expect(accepted).toEqual([]);
  });

  it('accepts a day with no measurements at all', () => {
    expect(isValid({ day: '2026-11-12', tz: 'Europe/Kyiv', platform: 'ios' })).toBe(true);
  });

  it('requires day, tz and platform', () => {
    expect(isValid({ tz: 'Europe/Kyiv', platform: 'ios' })).toBe(false);
    expect(isValid({ day: '2026-11-12', platform: 'ios' })).toBe(false);
    expect(isValid({ day: '2026-11-12', tz: 'Europe/Kyiv' })).toBe(false);
  });

  it('keeps measurements inside plausible ranges', () => {
    const base = { day: '2026-11-12', tz: 'Europe/Kyiv', platform: 'android' };
    expect(isValid({ ...base, steps: 0, sleep_minutes: 0 })).toBe(true);
    expect(isValid({ ...base, steps: 1.5 })).toBe(false);
    expect(isValid({ ...base, sleep_minutes: 1441 })).toBe(false);
    expect(isValid({ ...base, resting_hr_bpm: 19 })).toBe(false);
    expect(isValid({ ...base, weight_kg: 0 })).toBe(false);
    expect(isValid({ ...base, external_workouts: [{ type: 'running', minutes: 0 }] })).toBe(false);
  });
});
