import { describe, it, expect } from 'vitest';
import { localDay, summarize } from '../src/index.js';
import type { HealthDay } from '../src/index.js';

const TODAY = '2026-11-12';

function dayBack(back: number, fields: Partial<HealthDay> = {}): HealthDay {
  const d = new Date(Date.UTC(2026, 10, 12 - back));
  return { day: d.toISOString().slice(0, 10), tz: 'Europe/Kyiv', platform: 'ios', ...fields };
}

describe('summarize', () => {
  it('is null with no days, and with days that hold no measurements', () => {
    expect(summarize([], TODAY)).toBeNull();
    expect(summarize([dayBack(0), dayBack(1, { external_workouts: [] })], TODAY)).toBeNull();
  });

  it('is null when every day is outside the 14-day window', () => {
    expect(summarize([dayBack(15, { steps: 5000 }), dayBack(-1, { steps: 5000 })], TODAY)).toBeNull();
  });

  it('averages each measurement over the days that have it, rounded', () => {
    const days = [
      dayBack(1, { steps: 4000, sleep_minutes: 420, resting_hr_bpm: 60, active_energy_kcal: 300.4 }),
      dayBack(2, { steps: 6001, sleep_minutes: 481 }),
      dayBack(3, { steps: 8000 }),
    ];
    expect(summarize(days, TODAY)).toMatchObject({
      days_with_data: 3,
      avg_steps: 6000,
      avg_sleep_minutes: 451,
      avg_resting_hr_bpm: 60,
      avg_active_energy_kcal: 300,
    });
  });

  it('keeps the unfinished today out of the step and energy averages', () => {
    const full = Array.from({ length: 10 }, (_, i) => dayBack(i + 1, { steps: 10000, active_energy_kcal: 500 }));
    const summary = summarize([...full, dayBack(0, { steps: 300, active_energy_kcal: 20 })], TODAY)!;
    expect(summary.avg_steps).toBe(10000);
    expect(summary.avg_active_energy_kcal).toBe(500);
    expect(summary.days_with_data).toBe(11);
  });

  it('has no step average when today is the only day with steps', () => {
    const summary = summarize([dayBack(0, { steps: 300, sleep_minutes: 420 })], TODAY)!;
    expect(summary).not.toHaveProperty('avg_steps');
    expect(summary.avg_sleep_minutes).toBe(420); // last night is a finished night
  });

  it('leaves out measurements nobody recorded instead of reporting zero', () => {
    const summary = summarize([dayBack(1, { steps: 4000 })], TODAY)!;
    expect(summary.avg_steps).toBe(4000);
    for (const key of ['avg_sleep_minutes', 'avg_resting_hr_bpm', 'avg_active_energy_kcal', 'last_night_sleep_minutes', 'latest_weight_kg']) {
      expect(summary).not.toHaveProperty(key);
    }
  });

  it('reports last night, yesterday and the most recent weight', () => {
    const days = [
      dayBack(0, { sleep_minutes: 300, steps: 1200 }),
      dayBack(1, { steps: 9000, weight_kg: 78.2 }),
      dayBack(5, { weight_kg: 79.0 }),
    ];
    expect(summarize(days, TODAY)).toMatchObject({
      last_night_sleep_minutes: 300,
      yesterday_steps: 9000,
      latest_weight_kg: 78.2,
    });
  });

  it('counts external workouts of the last 7 days, today included', () => {
    const days = [
      dayBack(0, { external_workouts: [{ type: 'running', minutes: 40 }] }),
      dayBack(6, { external_workouts: [{ type: 'cycling', minutes: 60 }, { type: 'running', minutes: 20 }] }),
      dayBack(7, { external_workouts: [{ type: 'swimming', minutes: 30 }] }),
    ];
    const summary = summarize(days, TODAY)!;
    expect(summary.external_workouts_7d).toEqual({ count: 3, minutes: 120, types: ['cycling', 'running'] });
    expect(summary.external_workout_minutes_today).toBe(40);
  });

  it('carries the readiness for today', () => {
    const base = Array.from({ length: 7 }, (_, i) => dayBack(i + 1, { sleep_minutes: 480 }));
    expect(summarize([...base, dayBack(0, { sleep_minutes: 300 })], TODAY)!.readiness).toEqual({
      level: 'low',
      reasons: ['short_sleep', 'sleep_below_baseline'],
    });
    expect(summarize(base, TODAY)!.readiness.level).toBe('unknown');
  });
});

describe('localDay', () => {
  it('gives the calendar day in the given time zone', () => {
    const instant = new Date('2026-11-12T23:30:00Z');
    expect(localDay(instant, 'Europe/Kyiv')).toBe('2026-11-13');
    expect(localDay(instant, 'America/New_York')).toBe('2026-11-12');
  });

  it('falls back to the UTC day for an unknown time zone', () => {
    expect(localDay(new Date('2026-11-12T23:30:00Z'), 'Not/AZone')).toBe('2026-11-12');
  });
});
