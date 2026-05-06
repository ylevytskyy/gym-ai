// Build-time check + codegen: scans assets/exercise-renders/ for *.mp4,
// validates each filename's slug (snake_case or kebab-case → kebab) against
// the exercise catalog in assets/data/exercises.json, and emits
// src/lib/exerciseVideoMap.generated.ts.
//
// Run: npx tsx scripts/sync-exercise-videos.ts (or `pnpm sync-videos`).

import * as fs from "node:fs";
import * as path from "node:path";

const APP_ROOT = path.resolve(__dirname, "..");
const RENDERS_DIR = path.join(APP_ROOT, "assets", "exercise-renders");
const CATALOG_PATH = path.join(APP_ROOT, "assets", "data", "exercises.json");
const OUTPUT_PATH = path.join(APP_ROOT, "src", "lib", "exerciseVideoMap.generated.ts");

interface CatalogShape {
  exercises: Array<{ id: string }>;
}

function main(): void {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8")) as CatalogShape;
  const validIds = new Set(catalog.exercises.map((e) => e.id));

  const filenames = fs
    .readdirSync(RENDERS_DIR)
    .filter((f) => f.endsWith(".mp4"))
    .sort();

  type Entry = { id: string; filename: string };
  const entries: Entry[] = [];
  const unmatched: string[] = [];

  for (const filename of filenames) {
    const base = filename.replace(/\.mp4$/, "");
    const slug = base.replace(/_/g, "-");
    if (validIds.has(slug)) {
      entries.push({ id: slug, filename });
    } else {
      unmatched.push(filename);
    }
  }

  const seenIds = new Set<string>();
  const duplicateSlugs: string[] = [];
  for (const e of entries) {
    if (seenIds.has(e.id)) duplicateSlugs.push(e.id);
    seenIds.add(e.id);
  }
  if (duplicateSlugs.length > 0) {
    console.error("✗ Duplicate slug(s) in assets/exercise-renders/ (multiple MP4s map to the same id):");
    for (const s of duplicateSlugs) console.error(`  ${s}`);
    console.error("Each catalog id must have at most one MP4 (in either snake_case or kebab-case form).");
    process.exit(1);
  }

  if (unmatched.length > 0) {
    console.error("✗ Unmatched MP4 filenames in assets/exercise-renders/:");
    for (const f of unmatched) console.error(`  ${f}`);
    console.error(
      "Each .mp4 must derive (snake → kebab) to a valid exercise id in assets/data/exercises.json.",
    );
    process.exit(1);
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));

  const lines: string[] = [
    "// AUTO-GENERATED from assets/exercise-renders/ by scripts/sync-exercise-videos.ts",
    "// Do not edit by hand — re-run: pnpm sync-videos",
    "",
    "const map: Record<string, number> = {",
    ...entries.map(
      (e) =>
        `  ${JSON.stringify(e.id)}: require("../../assets/exercise-renders/${e.filename}"),`,
    ),
    "};",
    "",
    "export function getExerciseVideoSource(exerciseId: string): number | undefined {",
    "  return map[exerciseId];",
    "}",
    "",
  ];

  fs.writeFileSync(OUTPUT_PATH, lines.join("\n"), "utf8");
  console.log(
    `✓ Wrote ${entries.length} entries to ${path.relative(APP_ROOT, OUTPUT_PATH)}`,
  );
}

main();
