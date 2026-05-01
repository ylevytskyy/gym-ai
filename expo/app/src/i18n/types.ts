// Shape returned by exerciseText(id) — keep in sync with the structure stored
// in app/src/i18n/locales/<lang>/exercises.json.

export interface ExerciseText {
  name: string;
  instructions: string[];
  common_mistakes: string[];
  modifications: { easier: string; harder: string };
  notes: string | null;
}
