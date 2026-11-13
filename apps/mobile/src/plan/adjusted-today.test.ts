import type { HealthDay } from '@aura-fit/health-core';

import { exerciseById } from '@/catalog/catalog';

import { adjustedToday, explain } from './adjusted-today';
import type { WorkoutPlan } from './model';

const TODAY = '2026-11-12';
const now = new Date('2026-11-12T10:00:00');
const profile = { fitness_level: 2 as const, injuries: [] as string[] };

const plan: WorkoutPlan = {
  schema_version: '1.0.0',
  id: 'p',
  created_at: '2026-11-01T00:00:00Z',
  goal: 'move_more',
  notes: '',
  days: [
    {
      day: 1,
      title: 'Legs',
      minutes: 15,
      blocks: [
        { type: 'warm_up', items: [{ exercise_id: 'neck-rolls', sets: 1, amount: 10 }] },
        { type: 'main', items: [{ exercise_id: 'squat', sets: 3, amount: 12, rest_seconds: 30 }, { exercise_id: 'push-up', sets: 2, amount: 8 }] },
      ],
    },
  ],
};

function history(fields: Partial<HealthDay>, todayFields: Partial<HealthDay>): HealthDay[] {
  const days: HealthDay[] = [];
  for (let back = 7; back >= 1; back--) {
    const d = new Date(2026, 10, 12 - back);
    days.push({ day: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, tz: 'Europe/Kyiv', platform: 'ios', ...fields });
  }
  return [...days, { day: TODAY, tz: 'Europe/Kyiv', platform: 'ios', ...todayFields }];
}

const main = (day: { blocks: { type: string; items: { exercise_id: string; sets: number }[] }[] }) => day.blocks.find((b) => b.type === 'main')!.items;

describe('adjustedToday', () => {
  it('is the planned day when Health is not connected or there is no profile', () => {
    expect(adjustedToday(plan, [], now, TODAY, [], profile)).toEqual({ day: plan.days[0], doneToday: false });
    expect(adjustedToday(plan, [], now, TODAY, history({ sleep_minutes: 480 }, { sleep_minutes: 300 }), null)).toEqual({ day: plan.days[0], doneToday: false });
  });

  it('is the planned day, with no adjustment, on a normal day and when there is too little data', () => {
    const normal = adjustedToday(plan, [], now, TODAY, history({ sleep_minutes: 480 }, { sleep_minutes: 460 }), profile);
    expect(normal).toEqual({ day: plan.days[0], doneToday: false });
    const unknown = adjustedToday(plan, [], now, TODAY, [{ day: TODAY, tz: 'Europe/Kyiv', platform: 'ios', sleep_minutes: 200 }], profile);
    expect(unknown).not.toHaveProperty('adjustment');
  });

  it('lightens the session after a short night and says why', () => {
    const result = adjustedToday(plan, [], now, TODAY, history({ sleep_minutes: 480 }, { sleep_minutes: 300 }), profile);
    expect(main(result.day).map((item) => item.sets)).toEqual([2, 1]);
    expect(result.adjustment).toMatchObject({
      changes: ['sets_reduced'],
      readiness: { level: 'low' },
      reason: 'A lighter session today: you slept less than 6 hours and you slept much less than usual.',
    });
    // The plan itself is untouched.
    expect(main(plan.days[0]!).map((item) => item.sets)).toEqual([3, 2]);
  });

  it('adds a set after a good night', () => {
    const result = adjustedToday(plan, [], now, TODAY, history({ sleep_minutes: 450 }, { sleep_minutes: 470 }), profile);
    expect(main(result.day).map((item) => item.sets)).toEqual([4, 3]);
    expect(result.adjustment!.reason).toBe('One more set today: you slept well.');
  });

  it('turns the session into mobility work after a long workout elsewhere today', () => {
    const result = adjustedToday(
      plan,
      [],
      now,
      TODAY,
      history({ sleep_minutes: 450 }, { sleep_minutes: 470, external_workouts: [{ type: 'running', minutes: 25 }, { type: 'cycling', minutes: 20 }] }),
      profile,
    );
    expect(main(result.day).every((item) => exerciseById(item.exercise_id)?.group === 'warm_up')).toBe(true);
    expect(result.adjustment).toMatchObject({ changes: ['mobility_swap'], externalWorkoutMinutes: 45 });
    expect(result.adjustment!.reason).toBe('You already trained for 45 minutes today, so this session is mobility work instead.');
  });

  it('does not count yesterday workouts as today', () => {
    const days = history({ sleep_minutes: 450, external_workouts: [{ type: 'running', minutes: 60 }] }, { sleep_minutes: 440 });
    expect(adjustedToday(plan, [], now, TODAY, days, profile)).not.toHaveProperty('adjustment');
  });

  it('respects injuries and the fitness level when it swaps exercises', () => {
    const result = adjustedToday(
      plan,
      [],
      now,
      TODAY,
      history({ sleep_minutes: 450 }, { external_workouts: [{ type: 'running', minutes: 40 }] }),
      { fitness_level: 1, injuries: ['neck_injury', 'shoulder_injury'] },
    );
    for (const item of main(result.day)) {
      const exercise = exerciseById(item.exercise_id)!;
      expect(exercise.level).toBe(1);
      expect(exercise.avoid_if).not.toContain('neck_injury');
      expect(exercise.avoid_if).not.toContain('shoulder_injury');
    }
  });

  it('shows a session that is already done as it was planned, not adjusted after the fact', () => {
    const logs = [{ id: 'l', plan_id: 'p', day_number: 1, completed_at: '2026-11-12T07:00:00', health_record_id: null }];
    const result = adjustedToday(plan, logs, now, TODAY, history({ sleep_minutes: 480 }, { sleep_minutes: 300 }), profile);
    expect(result).toEqual({ day: plan.days[0], doneToday: true });
  });

  it('passes the user fitness level on: a hard exercise is replaced by one a beginner can do', () => {
    const hard: WorkoutPlan = { ...plan, days: [{ ...plan.days[0]!, blocks: [{ type: 'main', items: [{ exercise_id: 'decline-push-up', sets: 3, amount: 8 }] }] }] };
    expect(exerciseById('decline-push-up')!.level).toBe(3);
    const beginner = adjustedToday(hard, [], now, TODAY, history({ sleep_minutes: 480 }, { sleep_minutes: 300 }), { fitness_level: 1, injuries: [] });
    const intermediate = adjustedToday(hard, [], now, TODAY, history({ sleep_minutes: 480 }, { sleep_minutes: 300 }), { fitness_level: 2, injuries: [] });
    expect(exerciseById(main(beginner.day)[0]!.exercise_id)!.level).toBe(1);
    expect(exerciseById(main(intermediate.day)[0]!.exercise_id)!.level).toBe(2);
  });
});

describe('explain', () => {
  it('never mentions health conditions, only training', () => {
    const texts = [
      explain(['sets_reduced', 'exercise_replaced'], { level: 'low', reasons: ['resting_hr_elevated'] }, 0),
      explain(['sets_reduced'], { level: 'low', reasons: ['short_sleep', 'sleep_below_baseline', 'resting_hr_elevated'] }, 0),
      explain(['sets_added'], { level: 'high', reasons: ['well_recovered'] }, 0),
      explain(['mobility_swap'], { level: 'normal', reasons: [] }, 60),
    ];
    expect(texts[0]).toBe('A lighter session today: your resting heart rate is higher than usual.');
    for (const text of texts) expect(text).not.toMatch(/ill|sick|disease|diagnos|unhealthy|risk/i);
  });
});
