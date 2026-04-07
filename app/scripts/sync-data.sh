#!/usr/bin/env bash
# Sync the data foundation from the project root into the app's bundled assets.
# Run this whenever the root-level data files change.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(cd "$HERE/.." && pwd)"
SRC="$(cd "$APP_ROOT/.." && pwd)"
DEST="$APP_ROOT/assets/data"

mkdir -p "$DEST"

cp "$SRC/exercises.json"            "$DEST/exercises.json"
cp "$SRC/workout-plan.schema.json"  "$DEST/workout-plan.schema.json"
cp "$SRC/sample-weekly-plan.json"   "$DEST/sample-weekly-plan.json"

# The prompt template is bundled as a TS string literal so we don't need a
# metro asset-extension hack. Write it into src/lib/prompt-template.generated.ts.
TS_DEST="$APP_ROOT/src/lib/prompt-template.generated.ts"
PROMPT_SRC="$SRC/workout-generator-prompt.md"
{
  printf '// AUTO-GENERATED from ../../../workout-generator-prompt.md by scripts/sync-data.sh\n'
  printf '// Do not edit by hand — re-run: npm run sync-data\n\n'
  printf 'export const PROMPT_TEMPLATE = '
  # Escape for a JSON string, then wrap in backticks-safe chars
  # Use a JS-compatible literal: JSON stringify handles escapes; we wrap with JSON.parse at runtime
  # Simpler: emit a standard template literal with escaped backticks, backslashes, and ${}.
  sed -e 's/\\/\\\\/g' -e 's/`/\\`/g' -e 's/\${/\\${/g' "$PROMPT_SRC" \
    | awk 'BEGIN{printf "`"} {print} END{printf "`;\n"}'
} > "$TS_DEST"

echo "Synced data foundation into $DEST"
echo "Wrote prompt template to $TS_DEST"
