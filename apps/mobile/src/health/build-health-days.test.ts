import { Ajv2020 } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import fc from 'fast-check';

import healthDaySchema from '../../../../schemas/health-day.schema.json';
import { buildHealthDays } from './build-health-days';
import { daysInRange, endOfDay, localDayOf, startOfDay } from './local-day';
import { EMPTY_RAW_HEALTH, type RawHealth } from './types';

const options = { from: '2026-11-10', to: '2026-11-12', tz: 'Europe/Kyiv', platform: 'ios' as const };
const at = (iso: string) => new Date(iso); // local time (TZ is pinned to Europe/Kyiv)
const raw = (fields: Partial<RawHealth>): RawHealth => ({ ...EMPTY_RAW_HEALTH, ...fields });

describe('local days', () => {
  it('cuts days in the device time zone', () => {
    expect(localDayOf(new Date('2026-11-11T22:30:00Z'))).toBe('2026-11-12'); // 00:30 in Kyiv
    expect(daysInRange('2026-11-10', '2026-11-12')).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
    expect(daysInRange('2026-11-12', '2026-11-10')).toEqual([]);
  });

  it('gives a 23-hour and a 25-hour day across daylight-saving changes', () => {
    const hours = (day: string) => (endOfDay(day).getTime() - startOfDay(day).getTime()) / 3_600_000;
    expect(hours('2026-03-29')).toBe(23);
    expect(hours('2026-10-25')).toBe(25);
    expect(daysInRange('2026-10-24', '2026-10-26')).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
  });
});

describe('buildHealthDays', () => {
  it('returns one day per day in the range, oldest first, with no measurement fields when nothing was read', () => {
    expect(buildHealthDays(EMPTY_RAW_HEALTH, options)).toEqual([
      { day: '2026-11-10', tz: 'Europe/Kyiv', platform: 'ios' },
      { day: '2026-11-11', tz: 'Europe/Kyiv', platform: 'ios' },
      { day: '2026-11-12', tz: 'Europe/Kyiv', platform: 'ios' },
    ]);
  });

  it('places daily totals on their day and rounds them to the contract', () => {
    const days = buildHealthDays(
      raw({
        steps: [{ day: '2026-11-11', value: 8421.6 }],
        activeEnergyKcal: [{ day: '2026-11-11', value: 512.44 }],
        restingHrBpm: [{ day: '2026-11-12', value: 57.96 }],
      }),
      options,
    );
    expect(days[1]).toEqual({ day: '2026-11-11', tz: 'Europe/Kyiv', platform: 'ios', steps: 8422, active_energy_kcal: 512.4 });
    expect(days[2]).toMatchObject({ resting_hr_bpm: 58 });
  });

  it('keeps a real zero: zero steps read is not the same as no reading', () => {
    const days = buildHealthDays(raw({ steps: [{ day: '2026-11-11', value: 0 }] }), options);
    expect(days[1]).toHaveProperty('steps', 0);
    expect(days[0]).not.toHaveProperty('steps');
  });

  it('drops readings outside the contract ranges and outside the requested days', () => {
    const days = buildHealthDays(
      raw({
        steps: [{ day: '2026-11-11', value: -3 }, { day: '2026-11-09', value: 500 }],
        restingHrBpm: [{ day: '2026-11-11', value: 5 }],
        weightKg: [{ at: at('2026-11-11T08:00:00'), value: 0 }],
        activeEnergyKcal: [{ day: '2026-11-11', value: Number.NaN }],
      }),
      options,
    );
    expect(days).toEqual(buildHealthDays(EMPTY_RAW_HEALTH, options));
  });

  it('takes the most recent weight of each day', () => {
    const days = buildHealthDays(
      raw({
        weightKg: [
          { at: at('2026-11-11T21:00:00'), value: 78.04 },
          { at: at('2026-11-11T07:00:00'), value: 78.6 },
          { at: at('2026-11-12T07:10:00'), value: 77.95 },
        ],
      }),
      options,
    );
    expect(days[1]).toMatchObject({ weight_kg: 78 });
    expect(days[2]).toMatchObject({ weight_kg: 78 });
    expect(days[0]).not.toHaveProperty('weight_kg');
  });

  describe('sleep', () => {
    it('lands on the day the night ended, including the part before midnight', () => {
      const days = buildHealthDays(
        raw({
          sleep: [
            { start: at('2026-11-10T23:10:00'), end: at('2026-11-10T23:40:00') },
            { start: at('2026-11-10T23:50:00'), end: at('2026-11-11T06:50:00') },
          ],
        }),
        options,
      );
      expect(days[1]).toMatchObject({ sleep_minutes: 450 });
      expect(days[0]).not.toHaveProperty('sleep_minutes');
    });

    it('counts time recorded by two sources once', () => {
      const days = buildHealthDays(
        raw({
          sleep: [
            { start: at('2026-11-11T23:00:00'), end: at('2026-11-12T07:00:00') }, // watch
            { start: at('2026-11-11T23:30:00'), end: at('2026-11-12T06:30:00') }, // phone, inside the first
            { start: at('2026-11-12T06:45:00'), end: at('2026-11-12T07:15:00') }, // overlaps the end
          ],
        }),
        options,
      );
      expect(days[2]).toMatchObject({ sleep_minutes: 495 });
    });

    it('counts an afternoon nap on the same day and an evening start on the next', () => {
      const days = buildHealthDays(
        raw({
          sleep: [
            { start: at('2026-11-11T14:00:00'), end: at('2026-11-11T14:40:00') },
            { start: at('2026-11-11T18:30:00'), end: at('2026-11-11T19:00:00') },
          ],
        }),
        options,
      );
      expect(days[1]).toMatchObject({ sleep_minutes: 40 });
      expect(days[2]).toMatchObject({ sleep_minutes: 30 });
    });

    it('switches to the next day exactly at 18:00', () => {
      const days = buildHealthDays(
        raw({
          sleep: [
            { start: at('2026-11-11T17:00:00'), end: at('2026-11-11T17:59:00') },
            { start: at('2026-11-11T18:00:00'), end: at('2026-11-11T18:20:00') },
          ],
        }),
        options,
      );
      expect(days[1]).toMatchObject({ sleep_minutes: 59 });
      expect(days[2]).toMatchObject({ sleep_minutes: 20 });
    });

    it('ignores empty or reversed intervals', () => {
      const days = buildHealthDays(
        raw({ sleep: [{ start: at('2026-11-12T07:00:00'), end: at('2026-11-12T07:00:00') }, { start: at('2026-11-12T07:00:00'), end: at('2026-11-12T03:00:00') }] }),
        options,
      );
      expect(days[2]).not.toHaveProperty('sleep_minutes');
    });
  });

  describe('external workouts', () => {
    it('lists workouts from other apps on the day they started, and leaves out our own', () => {
      const days = buildHealthDays(
        raw({
          workouts: [
            { start: at('2026-11-11T18:00:00'), end: at('2026-11-11T18:42:10'), type: 'running', energyKcal: 430.46, own: false },
            { start: at('2026-11-11T07:00:00'), end: at('2026-11-11T07:15:00'), type: 'strength', own: true },
            { start: at('2026-11-12T23:50:00'), end: at('2026-11-13T00:20:00'), type: 'yoga', own: false },
          ],
        }),
        options,
      );
      expect(days[1]!.external_workouts).toEqual([{ type: 'running', minutes: 42, energy_kcal: 430.5 }]);
      expect(days[2]!.external_workouts).toEqual([{ type: 'yoga', minutes: 30 }]);
      expect(days[0]).not.toHaveProperty('external_workouts');
    });

    it('drops workouts under a minute and keeps at most 50 a day', () => {
      const many = Array.from({ length: 60 }, (_, i) => ({
        start: new Date(at('2026-11-11T06:00:00').getTime() + i * 600_000),
        end: new Date(at('2026-11-11T06:05:00').getTime() + i * 600_000),
        type: 'walking' as const,
        own: false,
      }));
      const days = buildHealthDays(
        raw({ workouts: [...many, { start: at('2026-11-10T06:00:00'), end: at('2026-11-10T06:00:20'), type: 'other', own: false }] }),
        options,
      );
      expect(days[1]!.external_workouts).toHaveLength(50);
      expect(days[0]).not.toHaveProperty('external_workouts');
    });
  });

  it('produces only days that satisfy the health-day schema, whatever was read', () => {
    const ajv = new Ajv2020({ strict: true });
    (addFormats as unknown as (a: Ajv2020) => void)(ajv);
    const validate = ajv.compile(healthDaySchema);

    const number = fc.oneof(fc.double({ noNaN: false }), fc.integer({ min: -10, max: 300_000 }));
    const day = fc.constantFrom('2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13');
    const instant = fc.integer({ min: at('2026-11-09T00:00:00').getTime(), max: at('2026-11-14T00:00:00').getTime() }).map((ms) => new Date(ms));
    const reading = fc.array(fc.record({ day, value: number }), { maxLength: 6 });
    const interval = fc.tuple(instant, fc.integer({ min: -3_600_000, max: 40 * 3_600_000 })).map(([start, length]) => ({ start, end: new Date(start.getTime() + length) }));
    const rawArbitrary: fc.Arbitrary<RawHealth> = fc.record({
      steps: reading,
      activeEnergyKcal: reading,
      restingHrBpm: reading,
      weightKg: fc.array(fc.record({ at: instant, value: number }), { maxLength: 6 }),
      sleep: fc.array(interval, { maxLength: 8 }),
      workouts: fc.array(
        fc.tuple(interval, fc.constantFrom('running', 'strength', 'other') as fc.Arbitrary<'running' | 'strength' | 'other'>, fc.option(number, { nil: undefined }), fc.boolean()).map(
          ([i, type, energyKcal, own]) => ({ ...i, type, own, ...(energyKcal === undefined ? {} : { energyKcal }) }),
        ),
        { maxLength: 8 },
      ),
    });

    fc.assert(
      fc.property(rawArbitrary, (input) => {
        for (const built of buildHealthDays(input, options)) {
          if (!validate(built)) throw new Error(`${JSON.stringify(built)}: ${ajv.errorsText(validate.errors)}`);
        }
      }),
      { numRuns: 300 },
    );
  });
});
