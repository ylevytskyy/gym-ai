import { catalog, exerciseById } from '@/catalog/catalog';
import { INJURIES } from '@/profile/model';

import { DESK_BREAK_EXERCISES, deskBreak } from './desk-break';

describe('deskBreak', () => {
  it('is a short session of four standing exercises', () => {
    const day = deskBreak([], 0);
    expect(day.title).toBe('Desk break');
    expect(day.blocks).toHaveLength(1);
    expect(day.blocks[0]?.items).toHaveLength(4);
    expect(day.minutes).toBe(2);
  });

  it('uses only quiet, level-1 warm-up exercises from the catalog, with their default amounts', () => {
    for (const id of DESK_BREAK_EXERCISES) {
      const exercise = exerciseById(id);
      expect(exercise).toMatchObject({ group: 'warm_up', level: 1, quiet: true });
    }
    for (const item of deskBreak([], 3).blocks[0]?.items ?? []) {
      const exercise = exerciseById(item.exercise_id);
      expect(item).toEqual({ exercise_id: item.exercise_id, sets: 1, amount: exercise?.default.amount, rest_seconds: 0 });
    }
  });

  it('never includes an exercise that conflicts with an injury, for any injury and any seed', () => {
    for (const injury of INJURIES) {
      for (let seed = 0; seed < 12; seed++) {
        const items = deskBreak([injury], seed).blocks[0]?.items ?? [];
        expect(items.length).toBeGreaterThan(0);
        for (const item of items) expect(exerciseById(item.exercise_id)?.avoid_if).not.toContain(injury);
      }
    }
  });

  it('still offers something with every injury at once, and nothing unsafe', () => {
    const items = deskBreak([...INJURIES], 0).blocks[0]?.items ?? [];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(exerciseById(item.exercise_id)?.avoid_if).toEqual([]);
  });

  it('varies with the seed and has no exercise twice', () => {
    const first = deskBreak([], 0).blocks[0]?.items.map((i) => i.exercise_id) ?? [];
    const second = deskBreak([], 1).blocks[0]?.items.map((i) => i.exercise_id) ?? [];
    expect(first).not.toEqual(second);
    expect(new Set(first).size).toBe(first.length);
    expect(catalog.length).toBeGreaterThan(0);
  });
});
