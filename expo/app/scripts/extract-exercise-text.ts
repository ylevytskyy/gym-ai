// One-shot tool: splits the original `exercises.json` (at the project root)
// into a structural version + a locales/en/exercises.json dictionary.
//
// Usage (from app/):
//   npx tsx scripts/extract-exercise-text.ts
//
// Writes:
//   ../exercises.json                (overwritten, text fields removed)
//   ../locales/en/exercises.json     (created)
//   ../locales/uk/exercises.json     (created, stub with same keys)
//
// Run this ONCE during the i18n migration. After running, commit both
// changes; the extractor is not invoked again.

import * as fs from 'node:fs';
import * as path from 'node:path';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(PROJECT_ROOT, 'exercises.json');
const LOCALES_DIR = path.join(PROJECT_ROOT, 'locales');
const EN_DIR = path.join(LOCALES_DIR, 'en');
const UK_DIR = path.join(LOCALES_DIR, 'uk');

type ExerciseIn = {
  id: string;
  name: string;
  instructions: string[];
  common_mistakes: string[];
  modifications: { easier: string; harder: string };
  notes: string | null;
  [rest: string]: unknown;
};

type EnEntry = {
  name: string;
  instructions: string[];
  common_mistakes: string[];
  modifications: { easier: string; harder: string };
  notes: string | null;
};

const raw = fs.readFileSync(SRC, 'utf8');
const catalog = JSON.parse(raw) as {
  exercises: ExerciseIn[];
  [k: string]: unknown;
};

const enDict: Record<string, EnEntry> = {};
const ukDict: Record<string, EnEntry> = {};

const strippedExercises = catalog.exercises.map((ex) => {
  enDict[ex.id] = {
    name: ex.name,
    instructions: ex.instructions,
    common_mistakes: ex.common_mistakes,
    modifications: ex.modifications,
    notes: ex.notes,
  };
  ukDict[ex.id] = {
    name: '',
    instructions: ex.instructions.map(() => ''),
    common_mistakes: ex.common_mistakes.map(() => ''),
    modifications: { easier: '', harder: '' },
    notes: ex.notes === null ? null : '',
  };
  // Remove text fields from the structural copy.
  const { name: _n, instructions: _i, common_mistakes: _cm, modifications: _m, notes: _nt, ...rest } = ex;
  return rest;
});

const newCatalog = { ...catalog, exercises: strippedExercises };

fs.mkdirSync(EN_DIR, { recursive: true });
fs.mkdirSync(UK_DIR, { recursive: true });

fs.writeFileSync(SRC, JSON.stringify(newCatalog, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(EN_DIR, 'exercises.json'), JSON.stringify(enDict, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(UK_DIR, 'exercises.json'), JSON.stringify(ukDict, null, 2) + '\n', 'utf8');

console.log(`Wrote ${Object.keys(enDict).length} exercises to locales/en/exercises.json`);
console.log(`Wrote Ukrainian stub to locales/uk/exercises.json`);
console.log(`Stripped text fields from ${SRC}`);
