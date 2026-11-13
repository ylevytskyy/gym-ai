import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_NUDGE_SETTINGS, nudgeDue, planNudges, stepsInLastHour, type NudgePlanInput } from '../src/index.js';

const on = { ...DEFAULT_NUDGE_SETTINGS, enabled: true };
const KYIV = 'Europe/Kyiv'; // UTC+2 in November
const MIN = 60_000;

// Thursday 2026-11-12, 11:00 in Kyiv.
const thursday11 = new Date('2026-11-12T09:00:00Z');
const at = (minutes: number, from: Date = thursday11) => new Date(from.getTime() + minutes * MIN);

function input(overrides: Partial<NudgePlanInput> = {}): NudgePlanInput {
  return { now: thursday11, tz: KYIV, settings: on, recentSteps: [], sent: [], ...overrides };
}

describe('planNudges', () => {
  it('plans the first nudge for the moment the last hour falls under the threshold', () => {
    const plan = planNudges(input({ recentSteps: [{ end: at(-40), steps: 400 }] }));
    expect(plan[0]).toEqual(at(20));
  });

  it('plans a nudge now when the last hour is already sedentary', () => {
    const plan = planNudges(input({ recentSteps: [{ end: at(-30), steps: 100 }] }));
    expect(plan[0]).toEqual(thursday11);
  });

  it('waits until enough steps have left the last hour, not until all have', () => {
    // 200 + 200 = 400. Once the older 200 are more than an hour old, 200 remain: under 250.
    const plan = planNudges(input({ recentSteps: [{ end: at(-50), steps: 200 }, { end: at(-10), steps: 200 }] }));
    expect(plan[0]).toEqual(at(10));
  });

  it('spaces the following nudges by the gap, up to the daily limit', () => {
    const plan = planNudges(input());
    expect(plan).toEqual([thursday11, at(90), at(180)]);
  });

  it('plans nothing when steps are unknown: no data is never read as sitting', () => {
    expect(planNudges(input({ recentSteps: null }))).toEqual([]);
  });

  it('plans nothing when nudges are off', () => {
    expect(planNudges(input({ settings: DEFAULT_NUDGE_SETTINGS }))).toEqual([]);
  });

  it('starts at the beginning of active hours and never reaches their end', () => {
    // 07:30 in Kyiv: the first nudge waits for 09:00.
    const early = planNudges(input({ now: new Date('2026-11-12T05:30:00Z') }));
    expect(early[0]).toEqual(new Date('2026-11-12T07:00:00Z'));
    // 17:00 in Kyiv: 17:00 fits, 18:30 does not.
    const late = planNudges(input({ now: new Date('2026-11-12T15:00:00Z') }));
    expect(late).toEqual([new Date('2026-11-12T15:00:00Z')]);
    // 18:00 in Kyiv is outside.
    expect(planNudges(input({ now: new Date('2026-11-12T16:00:00Z') }))).toEqual([]);
  });

  it('plans nothing at the weekend when nudges are for weekdays only', () => {
    const saturday = new Date('2026-11-14T09:00:00Z');
    expect(planNudges(input({ now: saturday }))).toEqual([]);
    expect(planNudges(input({ now: saturday, settings: { ...on, weekdaysOnly: false } })).length).toBe(3);
  });

  it('counts nudges already sent today and keeps the gap to the last one', () => {
    const plan = planNudges(input({ sent: [at(-100), at(-30)] }));
    expect(plan).toEqual([at(60)]);
    expect(planNudges(input({ sent: [at(-120), at(-110), at(-100)] }))).toEqual([]);
  });

  it('ignores nudges sent on another local day', () => {
    expect(planNudges(input({ sent: [at(-24 * 60), at(-25 * 60), at(-26 * 60)] })).length).toBe(3);
  });

  it('does not plan before notBefore', () => {
    const plan = planNudges(input({ notBefore: at(45) }));
    expect(plan[0]).toEqual(at(45));
  });

  it('does not plan into the next day', () => {
    const wide = { ...on, startHour: 0, endHour: 24, weekdaysOnly: false, maxPerDay: 10 };
    // 23:00 in Kyiv: only 23:00 fits before midnight (the next would be 00:30).
    const plan = planNudges(input({ now: new Date('2026-11-12T21:00:00Z'), settings: wide }));
    expect(plan).toEqual([new Date('2026-11-12T21:00:00Z')]);
  });

  it('starts at the right hour on the days the clocks change', () => {
    const LA = 'America/Los_Angeles';
    const s = { ...on, startHour: 3, endHour: 20, weekdaysOnly: false };
    // 2026-03-08, 01:30 PST; clocks jump from 02:00 to 03:00. 03:00 PDT is 10:00 UTC.
    expect(planNudges(input({ tz: LA, settings: s, now: new Date('2026-03-08T09:30:00Z') }))[0]).toEqual(new Date('2026-03-08T10:00:00Z'));
    // 2026-11-01, 00:30 PDT; clocks go back from 02:00 to 01:00. 03:00 PST is 11:00 UTC.
    expect(planNudges(input({ tz: LA, settings: s, now: new Date('2026-11-01T07:30:00Z') }))[0]).toEqual(new Date('2026-11-01T11:00:00Z'));
  });

  it('survives nonsense settings and a bad time zone', () => {
    expect(planNudges(input({ tz: 'Not/AZone' }))).toEqual([]);
    expect(planNudges(input({ settings: { ...on, stepThreshold: 0 } }))).toEqual([]);
    expect(planNudges(input({ settings: { ...on, minGapMinutes: 0, maxPerDay: 1000 } })).length).toBeLessThanOrEqual(24);
    expect(planNudges(input({ recentSteps: [{ end: at(-5), steps: Number.NaN }] }))).toEqual([]);
  });

  it('every planned time is due by the nudgeDue rule', () => {
    const settings = fc.record({
      enabled: fc.constant(true),
      stepThreshold: fc.integer({ min: 1, max: 1000 }),
      startHour: fc.integer({ min: 0, max: 23 }),
      endHour: fc.integer({ min: 1, max: 24 }),
      weekdaysOnly: fc.boolean(),
      maxPerDay: fc.integer({ min: 1, max: 6 }),
      minGapMinutes: fc.integer({ min: 1, max: 240 }),
    });
    const bases = [Date.UTC(2026, 10, 9), Date.UTC(2026, 2, 5), Date.UTC(2026, 9, 29), Date.UTC(2026, 2, 26)]; // the last three span clock changes
    fc.assert(
      fc.property(
        settings,
        fc.integer({ min: 0, max: 7 * 24 * 60 }),
        fc.array(fc.record({ ago: fc.integer({ min: 0, max: 70 }), steps: fc.integer({ min: 0, max: 600 }) }), { maxLength: 12 }),
        fc.array(fc.integer({ min: 0, max: 600 }), { maxLength: 4 }),
        fc.constantFrom('Europe/Kyiv', 'America/Los_Angeles', 'Asia/Kolkata', 'Australia/Lord_Howe', 'UTC'),
        fc.constantFrom(...bases),
        (s, minute, steps, sentAgo, tz, base) => {
          const now = new Date(base + minute * MIN);
          const recentSteps = steps.map((b) => ({ end: at(-b.ago, now), steps: b.steps }));
          const sent = sentAgo.map((ago) => at(-ago, now));
          const plan = planNudges({ now, tz, settings: s, recentSteps, sent });
          plan.forEach((time, i) => {
            expect(time.getTime()).toBeGreaterThanOrEqual(now.getTime());
            expect(
              nudgeDue({ stepsLastHour: stepsInLastHour(recentSteps, time), now: time, tz, sentToday: [...sent, ...plan.slice(0, i)], settings: s }),
            ).toBe(true);
          });
        },
      ),
      { numRuns: 500 },
    );
  });
});
