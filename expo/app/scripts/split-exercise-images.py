#!/usr/bin/env python3
"""
Split a 2D-grid exercise reference image into individual step panels.

Layout model (must match generate-image-prompts.ts):
  tall   → 300 px wide × 600 px tall column, 1 panel
  wide   → 600 px wide × 600 px tall column, 1 or 2 stacked 600×300 cells (top-down)
  square → 600 px wide × 600 px tall column, 1 panel
Reading order: top-down within a column, left-to-right between columns.
An orphan wide (unpaired) occupies the BOTTOM half; the top half is blank.

Each panel is resized to its native output size:
  tall   → 300×600
  wide   → 600×300
  square → 600×600

Usage:
  python scripts/split-exercise-images.py              # process every raw image
  python scripts/split-exercise-images.py burpees       # process one id

Reads:   scripts/exercise-images/raw/{id}.png
         scripts/exercise-images/layouts.json
Writes:  assets/images/exercises/{id}/step-{n}.png
Updates: assets/data/exercise-images.json
Generates: src/lib/exerciseImageMap.ts
"""

import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "scripts" / "exercise-images" / "raw"
LAYOUTS_PATH = ROOT / "scripts" / "exercise-images" / "layouts.json"
OUTPUT_DIR = ROOT / "assets" / "images" / "exercises"
MANIFEST_PATH = ROOT / "assets" / "data" / "exercise-images.json"
TRANSLATIONS_PATH = ROOT / "src" / "i18n" / "locales" / "en" / "exercises.json"
IMAGE_MAP_PATH = ROOT / "src" / "lib" / "exerciseImageMap.ts"

OUTPUT_SIZES = {
    "tall": (300, 600),
    "wide": (600, 300),
    "square": (600, 600),
}


def load_layouts() -> dict[str, list[str]]:
    with open(LAYOUTS_PATH) as f:
        data = json.load(f)
    return data["exercises"]


def load_expected_steps() -> dict[str, int]:
    with open(TRANSLATIONS_PATH) as f:
        translations = json.load(f)
    return {eid: len(t["instructions"]) for eid, t in translations.items()}


def build_columns(layout: list[str]) -> list[dict]:
    """Group the flat orientation list into columns matching the generator's rules.

    Returns a list of columns. Each column has:
      - kind: "tall" | "wide" | "square"
      - width_units: 1 (tall) or 2 (wide/square), where 1 unit = 300 canonical px
      - cells: list of {step (1-indexed), orientation, y_frac (start), h_frac}
    """
    cols: list[dict] = []
    i = 0
    n = len(layout)
    while i < n:
        t = layout[i]
        if t == "tall":
            cols.append({
                "kind": "tall",
                "width_units": 1,
                "cells": [{"step": i + 1, "orientation": "tall", "y_frac": 0.0, "h_frac": 1.0}],
            })
            i += 1
        elif t == "square":
            cols.append({
                "kind": "square",
                "width_units": 2,
                "cells": [{"step": i + 1, "orientation": "square", "y_frac": 0.0, "h_frac": 1.0}],
            })
            i += 1
        elif t == "wide":
            cells = [{"step": i + 1, "orientation": "wide", "y_frac": 0.5, "h_frac": 0.5}]
            i += 1
            if i < n and layout[i] == "wide":
                # Top cell takes step i (the one we just added), bottom takes step i+1.
                # Wait: top-down reading, first wide is on top, second on bottom.
                cells[0] = {"step": i, "orientation": "wide", "y_frac": 0.0, "h_frac": 0.5}
                cells.append({"step": i + 1, "orientation": "wide", "y_frac": 0.5, "h_frac": 0.5})
                i += 1
            cols.append({"kind": "wide", "width_units": 2, "cells": cells})
        else:
            raise ValueError(f"Unknown orientation: {t!r}")
    return cols


def split_image(img: Image.Image, cols: list[dict]) -> dict[int, Image.Image]:
    """Crop each panel by proportional coordinates, keyed by 1-indexed step."""
    total_width_units = sum(c["width_units"] for c in cols)
    img_w, img_h = img.size

    panels: dict[int, Image.Image] = {}
    x_cursor_units = 0
    for col in cols:
        col_w_units = col["width_units"]
        x_start_frac = x_cursor_units / total_width_units
        x_end_frac = (x_cursor_units + col_w_units) / total_width_units
        x_cursor_units += col_w_units

        left = round(x_start_frac * img_w)
        right = round(x_end_frac * img_w)

        for cell in col["cells"]:
            top = round(cell["y_frac"] * img_h)
            bottom = round((cell["y_frac"] + cell["h_frac"]) * img_h)
            crop = img.crop((left, top, right, bottom))
            panels[cell["step"]] = crop

    return panels


def process_exercise(exercise_id: str, layout: list[str], expected_steps: int) -> int | None:
    raw_path = RAW_DIR / f"{exercise_id}.png"
    if not raw_path.exists():
        return None
    if len(layout) != expected_steps:
        print(f"  SKIP {exercise_id}: layout has {len(layout)} entries, translations has {expected_steps} steps")
        return None

    print(f"Processing {exercise_id}...")
    img = Image.open(raw_path).convert("RGBA")
    cols = build_columns(layout)
    panels_by_step = split_image(img, cols)

    out_dir = OUTPUT_DIR / exercise_id
    out_dir.mkdir(parents=True, exist_ok=True)

    step_count = len(panels_by_step)
    for step in sorted(panels_by_step.keys()):
        orientation = layout[step - 1]
        size = OUTPUT_SIZES[orientation]
        resized = panels_by_step[step].resize(size, Image.LANCZOS)
        out_path = out_dir / f"step-{step}.png"
        resized.save(out_path, "PNG", optimize=True)

    print(f"  Saved {step_count} panels to {out_dir}")
    return step_count


def update_manifest(results: dict[str, int]) -> None:
    if MANIFEST_PATH.exists():
        with open(MANIFEST_PATH) as f:
            manifest = json.load(f)
    else:
        manifest = {"version": "1.0.0", "exercises": {}}

    for eid, steps in results.items():
        manifest["exercises"][eid] = {"steps": steps}

    manifest["exercises"] = dict(sorted(manifest["exercises"].items()))

    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")

    print(f"Updated manifest with {len(results)} exercises ({len(manifest['exercises'])} total)")


def generate_image_map(manifest: dict) -> None:
    exercises = manifest.get("exercises", {})

    lines = [
        "// AUTO-GENERATED by scripts/split-exercise-images.py — do not edit manually.",
        "// Maps exerciseId → array of require() sources for each step image.",
        "",
        'import type { ImageSource } from "expo-image";',
        "",
        "// eslint-disable-next-line @typescript-eslint/no-var-requires",
        'const placeholder = require("../../assets/images/exercises/placeholder.png");',
        "",
        "const map: Record<string, ImageSource[]> = {",
    ]

    for eid in sorted(exercises.keys()):
        step_count = exercises[eid]["steps"]
        requires = ", ".join(
            f'require("../../assets/images/exercises/{eid}/step-{i + 1}.png")'
            for i in range(step_count)
        )
        lines.append(f'  "{eid}": [{requires}],')

    lines += [
        "};",
        "",
        "export function getExerciseStepImages(exerciseId: string): ImageSource[] | null {",
        "  return map[exerciseId] ?? null;",
        "}",
        "",
        "export function getPlaceholderImage(): ImageSource {",
        "  return placeholder;",
        "}",
        "",
    ]

    IMAGE_MAP_PATH.write_text("\n".join(lines))
    print(f"Generated {IMAGE_MAP_PATH}")


def main():
    layouts = load_layouts()
    expected = load_expected_steps()

    if len(sys.argv) > 1:
        target_ids = sys.argv[1:]
    else:
        target_ids = [p.stem for p in RAW_DIR.glob("*.png")]

    if not target_ids:
        print("No raw images found in", RAW_DIR)
        return

    results: dict[str, int] = {}
    for eid in sorted(target_ids):
        layout = layouts.get(eid)
        if layout is None:
            print(f"SKIP {eid} — not in layouts.json")
            continue
        steps = expected.get(eid)
        if steps is None:
            print(f"SKIP {eid} — not in translations")
            continue
        count = process_exercise(eid, layout, steps)
        if count is not None:
            results[eid] = count

    if results:
        update_manifest(results)
        with open(MANIFEST_PATH) as f:
            full_manifest = json.load(f)
        generate_image_map(full_manifest)

    print(f"Done. Processed {len(results)} exercises.")


if __name__ == "__main__":
    main()
