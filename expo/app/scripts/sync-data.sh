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

LOCALES_SRC="$SRC/locales"
LOCALES_DEST="$APP_ROOT/src/i18n/locales"
mkdir -p "$LOCALES_DEST/en" "$LOCALES_DEST/uk"
cp "$LOCALES_SRC/en/exercises.json" "$LOCALES_DEST/en/exercises.json"
cp "$LOCALES_SRC/uk/exercises.json" "$LOCALES_DEST/uk/exercises.json"

# The prompt template is bundled as a TS string literal so we don't need a
# metro asset-extension hack. Write it into src/lib/prompt-template.generated.ts.
TS_DEST="$APP_ROOT/src/lib/prompt-template.generated.ts"
PROMPT_SRC="$SRC/workout-generator-prompt.md"
{
  printf '// AUTO-GENERATED from ../../../workout-generator-prompt.md by scripts/sync-data.sh\n'
  printf '// Do not edit by hand — re-run: pnpm sync-data\n\n'
  printf 'export const PROMPT_TEMPLATE = '
  sed -e 's/\\/\\\\/g' -e 's/`/\\`/g' -e 's/\${/\\${/g' "$PROMPT_SRC" \
    | awk 'BEGIN{printf "`"} {print} END{printf "`;\n"}'
} > "$TS_DEST"

echo "Synced data foundation into $DEST"
echo "Synced locale files into $LOCALES_DEST"
echo "Wrote prompt template to $TS_DEST"
