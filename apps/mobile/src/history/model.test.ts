import type { HealthDay } from '@aura-fit/health-core';

import { healthTrends, weekSummary, type HistoryLog } from './model';

const day = (date: string, values: Partial<HealthDay> = {}): HealthDay => ({ day: date, tz: 'Europe/Kyiv', platform: 'ios', ...values });
const log = (completedAt: string, minutes: number): HistoryLog => ({
  id: completedAt,
  day_number: 1,
  duration_minutes: minutes,
  rating: null,
  completed_at: completedAt,
  health_record_id: null,
  sets: 3,
});

describe('healthTrends', () => {
  it('averages only the days that have a value: a day without data is not a zero', () => {
    const trends = healthTrends([day('2026-11-10', { steps: 4000, sleep_minutes: 420 }), day('2026-11-11'), day('2026-11-12', { steps: 6000 })]);
    expect(trends.avgSteps).toBe(5000);
    expect(trends.avgSleepMinutes).toBe(420);
    expect(trends.avgRestingHr).toBeUndefined();
    expect(trends.daysWithData).toBe(2);
  });

  it('keeps a real zero', () => {
    expect(healthTrends([day('2026-11-11', { steps: 0 }), day('2026-11-12', { steps: 1000 })]).avgSteps).toBe(500);
  });

  it('gives each day a bar scaled to the largest value, and none where there is no data', () => {
    const { bars } = healthTrends([day('2026-11-10', { steps: 2500 }), day('2026-11-11'), day('2026-11-12', { steps: 10000, sleep_minutes: 480 })]);
    expect(bars.map((b) => b.steps)).toEqual([0.25, undefined, 1]);
    expect(bars.map((b) => b.sleep)).toEqual([undefined, undefined, 1]);
    expect(bars.map((b) => b.day)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
  });

  it('counts workouts recorded by other apps and their minutes', () => {
    const trends = healthTrends([
      day('2026-11-11', { external_workouts: [{ type: 'running', minutes: 30 }] }),
      day('2026-11-12', { external_workouts: [{ type: 'yoga', minutes: 20 }, { type: 'walking', minutes: 45 }] }),
    ]);
    expect(trends.externalWorkouts).toEqual({ count: 3, minutes: 95 });
  });

  it('is empty for no days', () => {
    expect(healthTrends([])).toEqual({ daysWithData: 0, bars: [], externalWorkouts: { count: 0, minutes: 0 } });
  });
});

describe('weekSummary', () => {
  // Thursday 2026-11-12, local time.
  const now = new Date('2026-11-12T10:00:00');

  it('counts the workouts since Monday of this week', () => {
    const summary = weekSummary([log('2026-11-12T08:00:00', 10), log('2026-11-09T00:30:00', 5), log('2026-11-08T23:00:00', 20)], now);
    expect(summary).toEqual({ workouts: 2, minutes: 15 });
  });

  it('is zero with no logs', () => {
    expect(weekSummary([], now)).toEqual({ workouts: 0, minutes: 0 });
  });
});
