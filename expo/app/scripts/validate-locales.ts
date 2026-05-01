// Build-time check that every locale file has the same keys as English and
// that every exercise id in the structural catalog has a matching entry in
// both en and uk exercises.json. Fails the build on drift.
//
// Run: npx tsx scripts/validate-locales.ts

import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_ROOT = path.resolve(__dirname, '..');
const LOCALES = path.join(APP_ROOT, 'src', 'i18n', 'locales');
const LANGS = ['en', 'uk'] as const;
const NAMESPACES = ['common', 'enums', 'exercises'] as const;

type Issue = string;
const issues: Issue[] = [];

function loadJson(p: string): unknown {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function collectKeys(obj: unknown, prefix = ''): Set<string> {
  const out = new Set<string>();
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    if (prefix) out.add(prefix);
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const sub of collectKeys(v, key)) out.add(sub);
    } else {
      out.add(key);
    }
  }
  return out;
}

// 1) common + enums: key-set parity across en/uk
for (const ns of ['common', 'enums'] as const) {
  const enPath = path.join(LOCALES, 'en', `${ns}.json`);
  const ukPath = path.join(LOCALES, 'uk', `${ns}.json`);
  const en = collectKeys(loadJson(enPath));
  const uk = collectKeys(loadJson(ukPath));
  for (const k of en) {
    if (!uk.has(k)) issues.push(`[${ns}] missing in uk: ${k}`);
  }
  for (const k of uk) {
    if (!en.has(k)) issues.push(`[${ns}] orphan in uk (not in en): ${k}`);
  }
}

// 2) exercises: every id in structural catalog has en+uk text with required shape
const catalog = loadJson(path.join(APP_ROOT, 'assets', 'data', 'exercises.json')) as {
  exercises: Array<{ id: string }>;
};
const enEx = loadJson(path.join(LOCALES, 'en', 'exercises.json')) as Record<string, unknown>;
const ukEx = loadJson(path.join(LOCALES, 'uk', 'exercises.json')) as Record<string, unknown>;

const REQUIRED_FIELDS = [
  'name',
  'instructions',
  'common_mistakes',
  'modifications',
  'notes',
] as const;

function hasShape(entry: unknown): string[] {
  if (!entry || typeof entry !== 'object') return ['(not an object)'];
  const problems: string[] = [];
  const e = entry as Record<string, unknown>;
  for (const f of REQUIRED_FIELDS) {
    if (!(f in e)) problems.push(`missing '${f}'`);
  }
  if (e.instructions !== undefined && !Array.isArray(e.instructions)) {
    problems.push(`'instructions' must be an array`);
  }
  if (e.common_mistakes !== undefined && !Array.isArray(e.common_mistakes)) {
    problems.push(`'common_mistakes' must be an array`);
  }
  if (
    e.modifications !== undefined &&
    (typeof e.modifications !== 'object' ||
      e.modifications === null ||
      !('easier' in e.modifications) ||
      !('harder' in e.modifications))
  ) {
    problems.push(`'modifications' must have easier+harder`);
  }
  return problems;
}

for (const ex of catalog.exercises) {
  if (!(ex.id in enEx)) issues.push(`[exercises] missing in en: ${ex.id}`);
  else {
    const p = hasShape(enEx[ex.id]);
    for (const m of p) issues.push(`[exercises] en.${ex.id}: ${m}`);
  }
  if (!(ex.id in ukEx)) issues.push(`[exercises] missing in uk: ${ex.id}`);
  else {
    const p = hasShape(ukEx[ex.id]);
    for (const m of p) issues.push(`[exercises] uk.${ex.id}: ${m}`);
  }
}

for (const id of Object.keys(enEx)) {
  if (!catalog.exercises.find((x) => x.id === id)) {
    issues.push(`[exercises] orphan in en (not in catalog): ${id}`);
  }
}
for (const id of Object.keys(ukEx)) {
  if (!catalog.exercises.find((x) => x.id === id)) {
    issues.push(`[exercises] orphan in uk (not in catalog): ${id}`);
  }
}

if (issues.length > 0) {
  console.error(`validate-locales: ${issues.length} issue(s) found:`);
  for (const issue of issues) console.error(`  - ${issue}`);
  process.exit(1);
}

console.log(`validate-locales: OK (${catalog.exercises.length} exercises, ${LANGS.length} languages, ${NAMESPACES.length} namespaces)`);
