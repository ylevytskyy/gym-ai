// scripts/generate-image-prompts.ts
//
// Reads exercises.json + en/exercises.json + exercise-images/layouts.json
// and outputs one .txt prompt per exercise to scripts/exercise-images/prompts/.
//
// Panels tile into a 2D grid:
//   - "tall"   → full-height 300×600 column (upright figure)
//   - "wide"   → half-height 600×300 cell, stacks in pairs top-down (horizontal body)
//   - "square" → full-height 600×600 column (seated / close-up)
// Reading order: top-down within a column, left-to-right between columns.
// Wide pairs: first wide in source order is on top, next is on the bottom.
// Orphan wide (unpaired): rendered in the BOTTOM half, top half left blank.
//
// Usage: npx tsx scripts/generate-image-prompts.ts

import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const EXERCISES_PATH = path.join(ROOT, "assets/data/exercises.json");
const TRANSLATIONS_PATH = path.join(
  ROOT,
  "src/i18n/locales/en/exercises.json",
);
const LAYOUTS_PATH = path.join(
  ROOT,
  "scripts/exercise-images/layouts.json",
);
const POSE_DETAILS_PATH = path.join(
  ROOT,
  "scripts/exercise-images/pose-details.json",
);
const OUTPUT_DIR = path.join(ROOT, "scripts/exercise-images/prompts");

type Orientation = "tall" | "wide" | "square";

interface CatalogJson {
  exercises: Array<{ id: string }>;
}

interface ExerciseTranslation {
  name: string;
  instructions: string[];
}

interface LayoutsJson {
  exercises: Record<string, Orientation[]>;
}

interface PoseDetailsJson {
  exercises: Record<string, string[]>;
}

const catalog: CatalogJson = JSON.parse(
  fs.readFileSync(EXERCISES_PATH, "utf-8"),
);
const translations: Record<string, ExerciseTranslation> = JSON.parse(
  fs.readFileSync(TRANSLATIONS_PATH, "utf-8"),
);
const layoutsFile: LayoutsJson = JSON.parse(
  fs.readFileSync(LAYOUTS_PATH, "utf-8"),
);
const poseDetailsFile: PoseDetailsJson = JSON.parse(
  fs.readFileSync(POSE_DETAILS_PATH, "utf-8"),
);

interface ColumnCell {
  step: number; // 1-indexed
  orientation: Orientation;
}

interface Column {
  kind: "tall" | "wide" | "square";
  // For "wide": 1 or 2 cells, top-down reading order.
  // For "tall"/"square": exactly 1 cell.
  cells: ColumnCell[];
}

function buildColumns(layout: Orientation[]): Column[] {
  const cols: Column[] = [];
  let i = 0;
  while (i < layout.length) {
    const t = layout[i];
    if (t === "tall") {
      cols.push({ kind: "tall", cells: [{ step: i + 1, orientation: "tall" }] });
      i += 1;
    } else if (t === "square") {
      cols.push({
        kind: "square",
        cells: [{ step: i + 1, orientation: "square" }],
      });
      i += 1;
    } else {
      const cells: ColumnCell[] = [
        { step: i + 1, orientation: "wide" },
      ];
      i += 1;
      if (i < layout.length && layout[i] === "wide") {
        cells.push({ step: i + 1, orientation: "wide" });
        i += 1;
      }
      cols.push({ kind: "wide", cells });
    }
  }
  return cols;
}

function columnWidthUnits(col: Column): number {
  // Canonical unit = 300 px. Column height is always 2 units (600 px).
  // tall:   300 wide × 600 tall → 1 unit wide
  // wide:   600 wide × 600 tall → 2 units wide (half-height 600×300 cells stacked)
  // square: 600 wide × 600 tall → 2 units wide (single 600×600 cell)
  return col.kind === "tall" ? 1 : 2;
}

function totalWidthUnits(cols: Column[]): number {
  return cols.reduce((s, c) => s + columnWidthUnits(c), 0);
}

const STYLE_BLOCK = `Style requirements:
- Illustrated cartoon style, clean vector-like look, bold outlines, flat colors, minimal shading
- Gender-neutral abstract human figure with simplified features, no specific ethnicity
- The SAME character in every panel: same body proportions, same skin tone, same plain short-sleeve t-shirt, same knee-length shorts, no logos, no patterns, no accessories
- White / transparent background outside and inside the grid
- Thin medium-gray lines (about 2 px) drawn between every adjacent panel, both vertical (between columns) and horizontal (between stacked cells in a wide column)
- Outer edge of the whole image is a thin medium-gray rectangle
- Panels are packed tightly — no gaps, no rounded corners, no shadows outside the panel borders
- A horizontal floor/ground line is drawn inside every panel so the figure's ground reference is unambiguous; in seated panels a chair is drawn resting on that floor line
- NO text, labels, numbers, captions, titles, watermarks, or written annotations anywhere in the image — wordless motion lines (small curved or straight strokes) are acceptable
- Every panel is cropped to fit the figure: the figure's head, hands, and feet are fully inside the panel with a small consistent margin`;

function buildGridSpec(cols: Column[]): string {
  const totalW = totalWidthUnits(cols);
  const lines: string[] = [];
  lines.push(
    `Overall canvas: a single rectangular image exactly ${totalW * 300} pixels wide and 600 pixels tall, divided into ${cols.length} column(s) from left to right.`,
  );
  lines.push("");
  lines.push("Column-by-column structure (from left to right):");
  let x = 0;
  cols.forEach((col, idx) => {
    const w = columnWidthUnits(col) * 300;
    const xStart = x * 300;
    const xEnd = (x + columnWidthUnits(col)) * 300;
    x += columnWidthUnits(col);
    if (col.kind === "tall") {
      lines.push(
        `  • Column ${idx + 1}: ${w} px wide × 600 px tall (x=${xStart}..${xEnd}). Contains ONE tall panel (portrait, aspect 1:2) showing step ${col.cells[0].step}. The figure is drawn upright and fills the panel vertically from near the top edge to the floor line near the bottom.`,
      );
    } else if (col.kind === "square") {
      lines.push(
        `  • Column ${idx + 1}: ${w} px wide × 600 px tall (x=${xStart}..${xEnd}). Contains ONE square panel (aspect 1:1) showing step ${col.cells[0].step}. The figure is drawn compact (seated on a chair, kneeling, or close-up torso/head as specified in that step).`,
      );
    } else {
      // wide
      if (col.cells.length === 2) {
        lines.push(
          `  • Column ${idx + 1}: ${w} px wide × 600 px tall (x=${xStart}..${xEnd}). Contains TWO wide panels stacked vertically (each landscape, aspect 2:1, ${w} px × 300 px). TOP cell (y=0..300) shows step ${col.cells[0].step}. BOTTOM cell (y=300..600) shows step ${col.cells[1].step}. A thin gray horizontal divider separates them at y=300.`,
        );
      } else {
        lines.push(
          `  • Column ${idx + 1}: ${w} px wide × 600 px tall (x=${xStart}..${xEnd}). TOP cell (y=0..300) is left BLANK/white (an intentional empty half). BOTTOM cell (y=300..600) contains ONE wide panel (aspect 2:1) showing step ${col.cells[0].step}. A thin gray horizontal divider at y=300 separates the empty half from the panel.`,
        );
      }
    }
  });
  return lines.join("\n");
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

let generated = 0;
let skippedNoTranslation = 0;
let skippedNoLayout = 0;

for (const exercise of catalog.exercises) {
  const t = translations[exercise.id];
  if (!t) {
    console.warn(`SKIP ${exercise.id} — no English translation`);
    skippedNoTranslation++;
    continue;
  }
  const layout = layoutsFile.exercises[exercise.id];
  if (!layout) {
    console.warn(`SKIP ${exercise.id} — no layout in layouts.json`);
    skippedNoLayout++;
    continue;
  }
  if (layout.length !== t.instructions.length) {
    console.warn(
      `SKIP ${exercise.id} — layout has ${layout.length} entries, translations has ${t.instructions.length} steps`,
    );
    continue;
  }

  const cols = buildColumns(layout);
  const gridSpec = buildGridSpec(cols);

  const poseDetails = poseDetailsFile.exercises[exercise.id];
  if (!poseDetails) {
    console.warn(`SKIP ${exercise.id} — no pose-details entry`);
    continue;
  }
  if (poseDetails.length !== t.instructions.length) {
    console.warn(
      `SKIP ${exercise.id} — pose-details has ${poseDetails.length} entries, translations has ${t.instructions.length} steps`,
    );
    continue;
  }

  const panelLines = t.instructions.map((summary, i) => {
    const o = layout[i];
    const detail = poseDetails[i];
    return `Step ${i + 1} (${o.toUpperCase()} panel) — summary: ${summary}\n  Pose to draw: ${detail}`;
  });

  const prompt = `Create a single illustrated reference image for the exercise "${t.name}". The image is a tightly-packed panel grid (not a slideshow, not separate images — one combined picture). Follow the exact grid spec below; do NOT invent extra panels, do NOT merge panels, do NOT rearrange them.

${gridSpec}

Per-step contents (match each step to its panel in the grid above). The "Pose to draw" paragraph is the authoritative visual reference for that panel — follow every spatial detail literally (camera angle, joint angles, hand/foot positions, spine orientation, head/gaze). The "summary" is just the short workout instruction it corresponds to.

${panelLines.join("\n\n")}

Global drawing guidance:
- Default camera angle is side profile with the figure facing right, full body visible, floor line along the bottom of the panel. Deviate ONLY when the pose description explicitly specifies a different angle (e.g., "3/4 front view", "overhead").
- Use small wordless motion lines (short curved strokes or straight lines) to indicate motion ONLY when the pose description calls for them. No arrows with words.
- Never include text, numbers, step labels, captions, or any writing anywhere in the image.
- If any pose description references an object (chair, wall, doorway frame, stair, handrail), draw that object as a simple line drawing on the floor line inside that specific panel — do NOT put it in other panels.

${STYLE_BLOCK}`;

  const outPath = path.join(OUTPUT_DIR, `${exercise.id}.txt`);
  fs.writeFileSync(outPath, prompt, "utf-8");
  generated++;
}

console.log(
  `Generated ${generated} prompts in ${OUTPUT_DIR} (skipped: ${skippedNoTranslation} no-translation, ${skippedNoLayout} no-layout)`,
);
