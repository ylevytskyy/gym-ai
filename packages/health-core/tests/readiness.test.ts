import { describe, it, expect } from 'vitest';
import { readiness } from '../src/index.js';
import type { HealthDay } from '../src/index.js';

const TODAY = '2026-11-12';

/** `count` consecutive days ending the day before TODAY, each with the given measurements. */
function baseline(count: number, fields: Partial<HealthDay>): HealthDay[] {
  const days: HealthDay[] = [];
  for (let back = count; back >= 1; back--) {
    const d = new Date(Date.UTC(2026, 10, 12 - back));
    days.push({ day: d.toISOString().slice(0, 10), tz: 'Europe/Kyiv', platform: 'ios', ...fields });
  }
  return days;
}

function today(fields: Partial<HealthDay>): HealthDay {
  return { day: TODAY, tz: 'Europe/Kyiv', platform: 'ios', ...fields };
}

describe('readiness', () => {
  it('is unknown with fewer than 5 baseline days', () => {
    const days = [...baseline(4, { sleep_minutes: 450, resting_hr_bpm: 58 }), today({ sleep_minutes: 300, resting_hr_bpm: 70 })];
    expect(readiness(days, TODAY)).toEqual({ level: 'unknown', reasons: ['not_enough_data'] });
  });

  it('is unknown with no days at all, and when today has no measurements', () => {
    expect(readiness([], TODAY).level).toBe('unknown');
    expect(readiness(baseline(14, { sleep_minutes: 450 }), TODAY)).toEqual({ level: 'unknown', reasons: ['not_enough_data'] });
  });

  it('ignores days older than 14 days when counting the baseline', () => {
    const old = baseline(20, { sleep_minutes: 450 }).slice(0, 6); // 20..15 days back
    const recent = baseline(4, { sleep_minutes: 450 });
    expect(readiness([...old, ...recent, today({ sleep_minutes: 450 })], TODAY).level).toBe('unknown');
  });

  it('is low after a night under 6 hours', () => {
    // Baseline is short too, so only the absolute rule can fire.
    const days = [...baseline(7, { sleep_minutes: 370 }), today({ sleep_minutes: 359 })];
    expect(readiness(days, TODAY)).toEqual({ level: 'low', reasons: ['short_sleep'] });
  });

  it('is low when sleep falls under 80% of the baseline median', () => {
    const days = [...baseline(7, { sleep_minutes: 500 }), today({ sleep_minutes: 399 })];
    expect(readiness(days, TODAY)).toEqual({ level: 'low', reasons: ['sleep_below_baseline'] });
    const atThreshold = [...baseline(7, { sleep_minutes: 500 }), today({ sleep_minutes: 400 })];
    expect(readiness(atThreshold, TODAY).level).toBe('normal');
  });

  it('is low when resting heart rate is 7% or more above the baseline median', () => {
    const base = baseline(7, { sleep_minutes: 450, resting_hr_bpm: 60 });
    expect(readiness([...base, today({ sleep_minutes: 450, resting_hr_bpm: 64.2 })], TODAY)).toEqual({
      level: 'low',
      reasons: ['resting_hr_elevated'],
    });
    expect(readiness([...base, today({ sleep_minutes: 440, resting_hr_bpm: 64 })], TODAY).level).toBe('normal');
  });

  it('lists every reason when several hold', () => {
    const days = [...baseline(7, { sleep_minutes: 480, resting_hr_bpm: 60 }), today({ sleep_minutes: 300, resting_hr_bpm: 70 })];
    expect(readiness(days, TODAY)).toEqual({
      level: 'low',
      reasons: ['short_sleep', 'sleep_below_baseline', 'resting_hr_elevated'],
    });
  });

  it('is high when sleep is at or above baseline and resting heart rate at or below it', () => {
    const days = [...baseline(7, { sleep_minutes: 450, resting_hr_bpm: 60 }), today({ sleep_minutes: 450, resting_hr_bpm: 60 })];
    expect(readiness(days, TODAY)).toEqual({ level: 'high', reasons: ['well_recovered'] });
  });

  it('is normal between the two', () => {
    const days = [...baseline(7, { sleep_minutes: 450, resting_hr_bpm: 60 }), today({ sleep_minutes: 430, resting_hr_bpm: 60 })];
    expect(readiness(days, TODAY)).toEqual({ level: 'normal', reasons: [] });
  });

  it('rests on sleep alone when there is no resting heart rate anywhere', () => {
    const base = baseline(7, { sleep_minutes: 450 });
    expect(readiness([...base, today({ sleep_minutes: 460 })], TODAY)).toEqual({ level: 'high', reasons: ['well_recovered'] });
    expect(readiness([...base, today({ sleep_minutes: 300 })], TODAY).level).toBe('low');
  });

  it('never calls a day high on resting heart rate alone', () => {
    const days = [...baseline(7, { resting_hr_bpm: 60 }), today({ resting_hr_bpm: 55 })];
    expect(readiness(days, TODAY)).toEqual({ level: 'normal', reasons: [] });
  });

  it('uses the median, so one outlier night does not move the baseline', () => {
    const base = baseline(7, { sleep_minutes: 450 });
    base[3] = { ...base[3]!, sleep_minutes: 60 };
    expect(readiness([...base, today({ sleep_minutes: 450 })], TODAY).level).toBe('high');
  });

  it('takes the mean of the two middle nights for an even number of baseline days', () => {
    // Six nights: 400, 400, 400, 500, 500, 500 -> median 450, so 80% is 360.
    const base = baseline(6, { sleep_minutes: 400 }).map((d, i) => (i < 3 ? d : { ...d, sleep_minutes: 500 }));
    // 445 is under the median of 450 (not high) but would count as high against either middle value's lower half.
    expect(readiness([...base, today({ sleep_minutes: 445 })], TODAY).level).toBe('normal');
    expect(readiness([...base, today({ sleep_minutes: 450 })], TODAY).level).toBe('high');
    // 395 is under 80% of 500 (400) but not under 80% of 450 (360): the upper-middle value alone would call it low.
    expect(readiness([...base, today({ sleep_minutes: 395 })], TODAY).level).toBe('normal');
  });

  it('does not depend on the order of the days', () => {
    const days = [...baseline(7, { sleep_minutes: 480 }), today({ sleep_minutes: 300 })];
    expect(readiness([...days].reverse(), TODAY)).toEqual(readiness(days, TODAY));
  });
});
