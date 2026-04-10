// scripts/generate-image-prompts.ts
//
// Reads exercises.json + en/exercises.json and outputs one .txt prompt
// per exercise to scripts/exercise-images/prompts/.
//
// Usage: npx tsx scripts/generate-image-prompts.ts

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const EXERCISES_PATH = path.join(ROOT, "assets/data/exercises.json");
const TRANSLATIONS_PATH = path.join(
  ROOT,
  "src/i18n/locales/en/exercises.json",
);
const OUTPUT_DIR = path.join(ROOT, "scripts/exercise-images/prompts");

const STYLE_BLOCK = `Style requirements:
- Illustrated cartoon style, clean vector-like look
- Gender-neutral abstract human figure with simplified features, no specific ethnicity
- White/transparent background
- Each panel is a perfect square
- Consistent character size and proportions across all panels
- Thin gray vertical lines separating panels
- No text, labels, numbers, or annotations anywhere in the image
- Clean outlines, flat colors, minimal shading
- Show the figure from the angle that best demonstrates the movement`;

interface CatalogJson {
  exercises: Array<{ id: string }>;
}

interface ExerciseTranslation {
  name: string;
  instructions: string[];
}

const catalog: CatalogJson = JSON.parse(
  fs.readFileSync(EXERCISES_PATH, "utf-8"),
);
const translations: Record<string, ExerciseTranslation> = JSON.parse(
  fs.readFileSync(TRANSLATIONS_PATH, "utf-8"),
);

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

let generated = 0;

for (const exercise of catalog.exercises) {
  const t = translations[exercise.id];
  if (!t) {
    console.warn(`SKIP ${exercise.id} — no English translation found`);
    continue;
  }

  const steps = t.instructions;
  const panels = steps
    .map((desc, i) => `${i + 1}. ${desc}`)
    .join("\n");

  const prompt = `Create a single horizontal comic-strip illustration showing the exercise "${t.name}" in ${steps.length} sequential panels from left to right, separated by thin vertical dividers.

Panels (left to right):
${panels}

${STYLE_BLOCK}`;

  const outPath = path.join(OUTPUT_DIR, `${exercise.id}.txt`);
  fs.writeFileSync(outPath, prompt, "utf-8");
  generated++;
}

console.log(`Generated ${generated} prompts in ${OUTPUT_DIR}`);
