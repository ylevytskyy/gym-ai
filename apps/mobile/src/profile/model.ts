/**
 * The profile form: what the user may enter, how it is checked, and how values found in the
 * health store are turned into suggestions. Limits mirror the `profiles` table constraints
 * (supabase/migrations/001_create_profiles.sql), so a form that passes here saves.
 */

import type { ProfileHints } from '@/health/types';

export const AGE_RANGES = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'] as const;
export type AgeRange = (typeof AGE_RANGES)[number];

export const GOALS = ['move_more', 'build_strength', 'lose_weight', 'improve_flexibility'] as const;
export type Goal = (typeof GOALS)[number];

/** Injury identifiers the exercise catalog uses in avoid_if. */
export const INJURIES = [
  'neck_injury',
  'shoulder_injury',
  'elbow_injury',
  'wrist_injury',
  'lower_back_injury',
  'hip_injury',
  'knee_injury',
  'ankle_injury',
] as const;
export type Injury = (typeof INJURIES)[number];

export interface ProfileForm {
  ageRange: AgeRange | null;
  weightKg: string;
  goal: Goal | null;
  fitnessLevel: 1 | 2 | 3 | null;
  injuries: Injury[];
  minutesPerDay: string;
}

/** A profile row as the app writes it. */
export interface ProfileValues {
  age_range: AgeRange;
  weight_kg: number;
  goal: Goal;
  fitness_level: 1 | 2 | 3;
  injuries: Injury[];
  minutes_per_day: number;
  language: string;
}

export const EMPTY_PROFILE_FORM: ProfileForm = {
  ageRange: null,
  weightKg: '',
  goal: null,
  fitnessLevel: null,
  injuries: [],
  minutesPerDay: '15',
};

export type ProfileField = 'ageRange' | 'weightKg' | 'goal' | 'fitnessLevel' | 'minutesPerDay';
export type ProfileErrors = Partial<Record<ProfileField, string>>;

/** The age range for a date of birth (YYYY-MM-DD) on a given day; null under 18 or for a bad date. */
export function ageRangeFor(dateOfBirth: string, today: string): AgeRange | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/;
  const born = match.exec(dateOfBirth);
  const now = match.exec(today);
  if (!born || !now) return null;

  const [by, bm, bd] = born.slice(1).map(Number) as [number, number, number];
  const [ty, tm, td] = now.slice(1).map(Number) as [number, number, number];
  const hadBirthday = tm > bm || (tm === bm && td >= bd);
  const age = ty - by - (hadBirthday ? 0 : 1);

  if (age < 18 || age > 120) return null;
  if (age <= 24) return '18-24';
  if (age <= 34) return '25-34';
  if (age <= 44) return '35-44';
  if (age <= 54) return '45-54';
  if (age <= 64) return '55-64';
  return '65+';
}

/** What the form may offer from the health store. Values are suggestions until the user accepts them. */
export interface ProfileSuggestions {
  weightKg?: number;
  ageRange?: AgeRange;
}

export function suggestionsFrom(hints: ProfileHints, today: string): ProfileSuggestions {
  const suggestions: ProfileSuggestions = {};
  if (hints.weightKg !== undefined) {
    // The profile stores whole kilograms between 1 and 499.
    const whole = Math.round(hints.weightKg);
    if (whole > 0 && whole < 500) suggestions.weightKg = whole;
  }
  if (hints.dateOfBirth) {
    const range = ageRangeFor(hints.dateOfBirth, today);
    if (range) suggestions.ageRange = range;
  }
  return suggestions;
}

/** The form with the accepted suggestions filled in. Nothing is saved by this. */
export function applySuggestions(form: ProfileForm, suggestions: ProfileSuggestions): ProfileForm {
  return {
    ...form,
    ...(suggestions.weightKg === undefined ? {} : { weightKg: String(suggestions.weightKg) }),
    ...(suggestions.ageRange === undefined ? {} : { ageRange: suggestions.ageRange }),
  };
}

const wholeNumber = (text: string): number | null => (/^\d{1,4}$/.test(text.trim()) ? Number(text.trim()) : null);

export function validateProfile(
  form: ProfileForm,
  language = 'en',
): { ok: true; values: ProfileValues } | { ok: false; errors: ProfileErrors } {
  const errors: ProfileErrors = {};
  const weight = wholeNumber(form.weightKg);
  const minutes = wholeNumber(form.minutesPerDay);

  if (!form.ageRange) errors.ageRange = 'Choose your age range.';
  if (weight === null || weight <= 0 || weight >= 500) errors.weightKg = 'Enter your weight in whole kilograms (1 to 499).';
  if (!form.goal) errors.goal = 'Choose a goal.';
  if (!form.fitnessLevel) errors.fitnessLevel = 'Choose your level.';
  if (minutes === null || minutes <= 0 || minutes > 120) errors.minutesPerDay = 'Enter minutes per day (1 to 120).';

  if (Object.keys(errors).length > 0 || !form.ageRange || !form.goal || !form.fitnessLevel || weight === null || minutes === null) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    values: {
      age_range: form.ageRange,
      weight_kg: weight,
      goal: form.goal,
      fitness_level: form.fitnessLevel,
      injuries: INJURIES.filter((injury) => form.injuries.includes(injury)),
      minutes_per_day: minutes,
      language,
    },
  };
}
