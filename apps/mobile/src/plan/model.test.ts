import { catalog, exerciseById, exerciseName, exerciseTips } from '@/catalog/catalog';

import beginnerPlan from '../../../../examples/plans/beginner-3day-plan.json';
import { estimateEnergyKcal, isWorkoutPlan, sessionKind, todayPlan, type WorkoutLogRow, type WorkoutPlan } from './model';

const plan = beginnerPlan as unknown as WorkoutPlan;
const log = (day_number: number, completed_at: string): WorkoutLogRow => ({ id: `l${completed_at}`, plan_id: 'p', day_number, completed_at, health_record_id: null });
const now = new Date('2026-11-12T10:00:00');

describe('catalog', () => {
  it('names every exercise and falls back to a readable id for an unknown one', () => {
    expect(catalog.length).toBeGreaterThan(10);
    expect(catalog.every((exercise) => exerciseName(exercise.id) !== exercise.id.replace(/-/g, ' ') || !exercise.id.includes('-'))).toBe(true);
    expect(exerciseName('squat')).toBe('Squat');
    expect(exerciseName('made-up-move')).toBe('made up move');
    expect(exerciseTips('squat')).toEqual(expect.any(String));
    expect(exerciseTips('made-up-move')).toBeUndefined();
  });
});

describe('isWorkoutPlan', () => {
  it('accepts the example plans and rejects broken ones', () => {
    expect(isWorkoutPlan(plan)).toBe(true);
    const clone = () => JSON.parse(JSON.stringify(plan)) as WorkoutPlan;
    const broken: ((p: any) => void)[] = [
      (p) => (p.days = []),
      (p) => (p.days[0].blocks = []),
      (p) => (p.days[0].blocks[0].items = []),
      (p) => (p.days[0].blocks[0].items[0].sets = 0),
      (p) => (p.days[0].blocks[0].items[0].amount = '10'),
      (p) => (p.days[0].blocks[0].items[0].rest_seconds = -1),
      (p) => delete p.days[0].blocks[0].items[0].exercise_id,
      (p) => (p.days[0].blocks[0].type = 'party'),
      (p) => (p.days[0].day = 0),
      // Far beyond anything a person does: such a plan would freeze the player.
      (p) => (p.days[0].blocks[0].items[0].sets = 2_000_000),
      (p) => (p.days[0].blocks[0].items[0].amount = 100_000),
    ];
    for (const breakIt of broken) {
      const p = clone();
      breakIt(p);
      expect(isWorkoutPlan(p)).toBe(false);
    }
    for (const junk of [null, undefined, 'plan', 5, {}, { days: 'x' }]) expect(isWorkoutPlan(junk)).toBe(false);
  });
});

describe('todayPlan', () => {
  it('starts with the first day', () => {
    expect(todayPlan(plan, [], now)).toMatchObject({ day: { day: 1 }, doneToday: false });
  });

  it('moves to the next day after a session on an earlier date, and wraps around', () => {
    expect(todayPlan(plan, [log(1, '2026-11-11T18:00:00')], now)).toMatchObject({ day: { day: 2 }, doneToday: false });
    expect(todayPlan(plan, [log(3, '2026-11-10T18:00:00'), log(2, '2026-11-09T18:00:00')], now)).toMatchObject({ day: { day: 1 }, doneToday: false });
  });

  it('keeps today on screen as done after a session finished today, until local midnight', () => {
    expect(todayPlan(plan, [log(2, '2026-11-12T07:00:00'), log(1, '2026-11-11T07:00:00')], now)).toMatchObject({ day: { day: 2 }, doneToday: true });
    // 23:30 yesterday local time is yesterday, even though it is "today" in UTC+ zones' UTC date.
    expect(todayPlan(plan, [log(2, new Date('2026-11-11T23:30:00').toISOString())], now)).toMatchObject({ day: { day: 3 }, doneToday: false });
  });

  it('compares local days, not UTC days', () => {
    // 01:00 on the 12th in Kyiv is still the 11th in UTC: it is today here.
    expect(todayPlan(plan, [log(1, '2026-11-11T23:00:00Z')], now)).toMatchObject({ day: { day: 1 }, doneToday: true });
    // 23:00 on the 11th in Kyiv is the 11th in both: yesterday.
    expect(todayPlan(plan, [log(1, '2026-11-11T21:00:00Z')], now)).toMatchObject({ day: { day: 2 }, doneToday: false });
  });

  it('starts over when the last logged day is not in this plan, and ignores unreadable dates', () => {
    expect(todayPlan(plan, [log(9, '2026-11-11T07:00:00')], now)).toMatchObject({ day: { day: 1 }, doneToday: false });
    expect(todayPlan(plan, [log(2, 'not a date')], now)).toMatchObject({ day: { day: 1 }, doneToday: false });
  });

  it('follows the day numbers, not the order the days are stored in', () => {
    const shuffled = { ...plan, days: [...plan.days].reverse() };
    expect(todayPlan(shuffled, [], now).day.day).toBe(1);
  });
});

describe('sessionKind', () => {
  const dayWith = (ids: string[]) => ({ day: 1, title: 't', minutes: 5, blocks: [{ type: 'main' as const, items: ids.map((exercise_id) => ({ exercise_id, sets: 1, amount: 5 })) }] });

  it('is strength for strength work, hiit when cardio dominates, mobility for stretching', () => {
    expect(sessionKind(dayWith(['squat', 'push-up', 'jumping-jacks']), exerciseById)).toBe('strength');
    expect(sessionKind(dayWith(['jumping-jacks', 'high-knees', 'squat']), exerciseById)).toBe('hiit');
    expect(sessionKind(dayWith(['neck-rolls', 'cat-cow']), exerciseById)).toBe('mobility');
    expect(sessionKind(dayWith(['made-up']), exerciseById)).toBe('mobility');
    // Half cardio is not "dominated by cardio".
    expect(sessionKind(dayWith(['jumping-jacks', 'squat']), exerciseById)).toBe('strength');
  });
});

describe('estimateEnergyKcal', () => {
  it('is (MET - 1) x kilograms x hours of work, summed and rounded to one decimal', () => {
    // Active energy leaves out what the body would burn at rest (1 MET).
    const squat = exerciseById('squat')!;
    const plank = exerciseById('plank')!;
    const expected = Math.round(((squat.met - 1) * 72 * (300_000 / 3_600_000) + (plank.met - 1) * 72 * (60_000 / 3_600_000)) * 10) / 10;
    expect(estimateEnergyKcal({ squat: 300_000, plank: 60_000 }, 72, exerciseById)).toBe(expected);
    expect(expected).toBeGreaterThan(15);
    expect(expected).toBeLessThan(squat.met * 72 * (360_000 / 3_600_000));
  });

  it('is zero for no work, an unknown exercise or a missing weight', () => {
    expect(estimateEnergyKcal({}, 72, exerciseById)).toBe(0);
    expect(estimateEnergyKcal({ 'made-up': 600_000 }, 72, exerciseById)).toBe(0);
    expect(estimateEnergyKcal({ squat: 600_000 }, 0, exerciseById)).toBe(0);
  });
});
