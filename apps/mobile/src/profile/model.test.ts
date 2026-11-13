import { ageRangeFor, applySuggestions, EMPTY_PROFILE_FORM, suggestionsFrom, validateProfile, type ProfileForm } from './model';

const filled: ProfileForm = { ageRange: '25-34', weightKg: '72', goal: 'move_more', fitnessLevel: 1, injuries: ['knee_injury'], minutesPerDay: '15' };

describe('ageRangeFor', () => {
  it('counts the birthday itself and not the day before', () => {
    expect(ageRangeFor('2001-11-12', '2026-11-12')).toBe('25-34');
    expect(ageRangeFor('2001-11-13', '2026-11-12')).toBe('18-24');
  });

  it.each([
    ['2008-11-12', '18-24'],
    ['1992-01-01', '25-34'],
    ['1982-06-30', '35-44'],
    ['1972-06-30', '45-54'],
    ['1962-06-30', '55-64'],
    ['1950-06-30', '65+'],
  ])('puts someone born %s in %s', (born, range) => {
    expect(ageRangeFor(born, '2026-11-12')).toBe(range);
  });

  it.each([
    [24, '18-24'], [25, '25-34'], [34, '25-34'], [35, '35-44'], [44, '35-44'], [45, '45-54'],
    [54, '45-54'], [55, '55-64'], [64, '55-64'], [65, '65+'], [18, '18-24'], [17, null],
  ] as const)('puts age %s in %s', (age, range) => {
    // Born on this day `age` years ago: exactly that age today.
    expect(ageRangeFor(`${2026 - age}-11-12`, '2026-11-12')).toBe(range);
  });

  it('offers nothing for a minor, a future date or a malformed date', () => {
    for (const born of ['2008-11-13', '2030-01-01', '1890-01-01', '12.11.1990', '']) {
      expect(ageRangeFor(born, '2026-11-12')).toBeNull();
    }
  });
});

describe('suggestions from the health store', () => {
  it('rounds the weight to whole kilograms and derives the age range', () => {
    expect(suggestionsFrom({ weightKg: 78.4, dateOfBirth: '1990-04-15' }, '2026-11-12')).toEqual({ weightKg: 78, ageRange: '35-44' });
    expect(suggestionsFrom({ weightKg: 78.6 }, '2026-11-12')).toEqual({ weightKg: 79 });
  });

  it('offers only what is usable', () => {
    expect(suggestionsFrom({}, '2026-11-12')).toEqual({});
    expect(suggestionsFrom({ weightKg: 0.2, dateOfBirth: '2015-01-01' }, '2026-11-12')).toEqual({});
    expect(suggestionsFrom({ weightKg: 600 }, '2026-11-12')).toEqual({});
  });

  it('fills the form only when applied, and leaves the other fields alone', () => {
    const applied = applySuggestions({ ...EMPTY_PROFILE_FORM, goal: 'lose_weight' }, { weightKg: 78 });
    expect(applied).toEqual({ ...EMPTY_PROFILE_FORM, goal: 'lose_weight', weightKg: '78' });
    expect(applySuggestions(filled, {})).toEqual(filled);
  });
});

describe('validateProfile', () => {
  it('turns a complete form into a profile row', () => {
    expect(validateProfile(filled, 'uk')).toEqual({
      ok: true,
      values: { age_range: '25-34', weight_kg: 72, goal: 'move_more', fitness_level: 1, injuries: ['knee_injury'], minutes_per_day: 15, language: 'uk' },
    });
  });

  it('names every missing field of an empty form', () => {
    const result = validateProfile({ ...EMPTY_PROFILE_FORM, minutesPerDay: '' });
    expect(result.ok).toBe(false);
    expect(Object.keys((result as { errors: object }).errors).sort()).toEqual(['ageRange', 'fitnessLevel', 'goal', 'minutesPerDay', 'weightKg']);
  });

  it.each([
    ['weightKg', '0'], ['weightKg', '500'], ['weightKg', '72.5'], ['weightKg', '-5'], ['weightKg', 'abc'],
    ['minutesPerDay', '0'], ['minutesPerDay', '121'], ['minutesPerDay', '1e2'],
  ] as const)('rejects %s = %s, which the profiles table would refuse', (field, value) => {
    const result = validateProfile({ ...filled, [field]: value });
    expect(result).toEqual({ ok: false, errors: { [field]: expect.any(String) } });
  });

  it('accepts the edges the table allows', () => {
    expect(validateProfile({ ...filled, weightKg: '1', minutesPerDay: '120' }).ok).toBe(true);
    expect(validateProfile({ ...filled, weightKg: '499', minutesPerDay: '1' }).ok).toBe(true);
  });

  it('keeps only known injuries, in a stable order', () => {
    const result = validateProfile({ ...filled, injuries: ['knee_injury', 'neck_injury', 'made_up' as never] });
    expect(result.ok && result.values.injuries).toEqual(['neck_injury', 'knee_injury']);
  });
});
