import type { WorkoutDay } from '@aura-fit/health-core';

import type { Exercise } from '@/catalog/catalog';

import { dayKcal, itemKcal, kcalLabel } from './energy';

const fake = (id: string, unit: Exercise['unit'], met: number) => ({ id, unit, met }) as Exercise;
const known: Record<string, Exercise> = {
  plank: fake('plank', 'seconds', 4),
  squat: fake('squat', 'reps', 5),
  breathing: fake('breathing', 'seconds', 1),
};
const exercise = (id: string) => known[id];

describe('itemKcal', () => {
  it('counts a timed exercise for its sets times seconds', () => {
    // (4 - 1) MET x 60 kg x 60 s of work = 3 kcal
    expect(itemKcal({ exercise_id: 'plank', sets: 2, amount: 30 }, 60, exercise)).toBeCloseTo(3);
  });

  it('counts each planned rep as three seconds of work', () => {
    // 3 x 12 reps = 108 s; (5 - 1) MET x 80 kg x 0.03 h = 9.6 kcal
    expect(itemKcal({ exercise_id: 'squat', sets: 3, amount: 12 }, 80, exercise)).toBeCloseTo(9.6);
  });

  it('gives no estimate for an exercise the catalog does not know', () => {
    expect(itemKcal({ exercise_id: 'made-up', sets: 3, amount: 12 }, 80, exercise)).toBeUndefined();
  });

  it('gives no estimate without a usable body weight', () => {
    for (const weight of [0, -5, Number.NaN, undefined]) {
      expect(itemKcal({ exercise_id: 'squat', sets: 3, amount: 12 }, weight, exercise)).toBeUndefined();
    }
  });

  it('burns nothing extra for an exercise at resting effort', () => {
    expect(itemKcal({ exercise_id: 'breathing', sets: 1, amount: 60 }, 80, exercise)).toBe(0);
  });
});

const day = (items: WorkoutDay['blocks'][number]['items'][], minutes = 15): WorkoutDay =>
  ({ day: 1, title: 'Day', minutes, blocks: items.map((blockItems) => ({ type: 'main', items: blockItems })) }) as WorkoutDay;

describe('dayKcal', () => {
  it('adds up every exercise in every block', () => {
    // 3 kcal of plank at 60 kg, plus 3 x 12 squats at 60 kg = 108 s x 4 MET x 60 kg = 7.2 kcal
    const session = day([[{ exercise_id: 'plank', sets: 2, amount: 30 }], [{ exercise_id: 'squat', sets: 3, amount: 12 }]]);
    expect(dayKcal(session, 60, exercise)).toBeCloseTo(10.2);
  });

  it('leaves out exercises the catalog does not know', () => {
    const session = day([[{ exercise_id: 'plank', sets: 2, amount: 30 }, { exercise_id: 'made-up', sets: 9, amount: 99 }]]);
    expect(dayKcal(session, 60, exercise)).toBeCloseTo(3);
  });

  it('gives no estimate when no exercise in the day can be estimated', () => {
    expect(dayKcal(day([[{ exercise_id: 'made-up', sets: 3, amount: 12 }]]), 60, exercise)).toBeUndefined();
  });

  it('gives no estimate without a body weight', () => {
    expect(dayKcal(day([[{ exercise_id: 'plank', sets: 2, amount: 30 }]]), undefined, exercise)).toBeUndefined();
  });
});

describe('kcalLabel', () => {
  it('rounds to whole kilocalories and marks the figure as approximate', () => {
    expect(kcalLabel(9.6)).toBe('≈ 10 kcal');
    expect(kcalLabel(3.2)).toBe('≈ 3 kcal');
  });

  it('says less than one rather than zero for a small but real burn', () => {
    expect(kcalLabel(0.3)).toBe('< 1 kcal');
  });

  it('says zero when the exercise adds nothing over resting', () => {
    expect(kcalLabel(0)).toBe('0 kcal');
  });
});
