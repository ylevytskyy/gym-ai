import { createHealthKitStore, HEALTHKIT_ACCESS, type HealthKitApi } from './healthkit-store';

const at = (iso: string) => new Date(iso);

type Fake = { -readonly [K in keyof HealthKitApi]: jest.Mock };

const READABLE: readonly string[] = HEALTHKIT_ACCESS.toRead;
const WRITABLE: readonly string[] = HEALTHKIT_ACCESS.toShare;

/**
 * On a phone, querying a type that was never requested crashes the app. The fake does the
 * same: any call naming an identifier outside HEALTHKIT_ACCESS throws.
 */
function strict(fake: Fake): Fake {
  const guard = (name: keyof Fake, allowed: readonly string[], pick: (args: unknown[]) => unknown) => {
    const inner = fake[name];
    fake[name] = jest.fn((...args: unknown[]) => {
      const identifier = pick(args);
      if (typeof identifier === 'string' && !allowed.includes(identifier)) {
        throw new Error(`${String(name)} used ${identifier}, which is not requested in HEALTHKIT_ACCESS`);
      }
      return inner(...args);
    });
  };
  guard('queryStatisticsCollectionForQuantity', READABLE, (a) => a[0]);
  guard('queryQuantitySamples', READABLE, (a) => a[0]);
  guard('queryCategorySamples', READABLE, (a) => a[0]);
  guard('getMostRecentQuantitySample', READABLE, (a) => a[0]);
  guard('deleteObjects', WRITABLE, (a) => a[0]);
  guard('saveWorkoutSample', WRITABLE, (a) => (a[1] as { quantityType: string }[])[0]?.quantityType);
  return fake;
}

function fakeHealthKit(overrides: Partial<Fake> = {}): Fake {
  return strict({
    isHealthDataAvailableAsync: jest.fn(async () => true),
    getRequestStatusForAuthorization: jest.fn(async () => 2), // unnecessary: already answered
    requestAuthorization: jest.fn(async () => true),
    authorizationStatusFor: jest.fn(() => 2), // sharingAuthorized
    queryStatisticsCollectionForQuantity: jest.fn(async () => []),
    queryQuantitySamples: jest.fn(async () => []),
    queryCategorySamples: jest.fn(async () => []),
    queryWorkoutSamples: jest.fn(async () => []),
    getMostRecentQuantitySample: jest.fn(async () => undefined),
    getDateOfBirthAsync: jest.fn(async () => undefined),
    currentAppSource: jest.fn(() => ({ bundleIdentifier: 'app.aurafit.mobile', name: 'Aura Fit' })),
    saveWorkoutSample: jest.fn(async () => ({ uuid: 'HK-UUID-1' })),
    deleteObjects: jest.fn(async () => 1),
    ...overrides,
  });
}

const store = (hk: Fake) => createHealthKitStore(hk as unknown as HealthKitApi, () => 'Europe/Kyiv');

describe('HealthKit store: status and connect', () => {
  it('is unavailable when the phone has no Health, and when the check itself fails', async () => {
    expect(await store(fakeHealthKit({ isHealthDataAvailableAsync: jest.fn(async () => false) })).status()).toBe('unavailable');
    expect(await store(fakeHealthKit({ isHealthDataAvailableAsync: jest.fn(async () => { throw new Error('boom'); }) })).status()).toBe('unavailable');
  });

  it('is not connected while the permission request still needs showing', async () => {
    expect(await store(fakeHealthKit({ getRequestStatusForAuthorization: jest.fn(async () => 1) })).status()).toBe('not_connected');
    expect(await store(fakeHealthKit({ getRequestStatusForAuthorization: jest.fn(async () => 0) })).status()).toBe('not_connected');
  });

  it('asks for exactly the types this build reads and writes', async () => {
    const hk = fakeHealthKit();
    await store(hk).connect();

    expect(hk.requestAuthorization).toHaveBeenCalledWith(HEALTHKIT_ACCESS);
    expect([...HEALTHKIT_ACCESS.toRead].sort()).toEqual([
      'HKCategoryTypeIdentifierSleepAnalysis',
      'HKCharacteristicTypeIdentifierDateOfBirth',
      'HKQuantityTypeIdentifierActiveEnergyBurned',
      'HKQuantityTypeIdentifierBodyMass',
      'HKQuantityTypeIdentifierRestingHeartRate',
      'HKQuantityTypeIdentifierStepCount',
      'HKWorkoutTypeIdentifier',
    ]);
    expect([...HEALTHKIT_ACCESS.toShare].sort()).toEqual(['HKQuantityTypeIdentifierActiveEnergyBurned', 'HKWorkoutTypeIdentifier']);
  });

  it('survives a request that cannot be shown', async () => {
    const hk = fakeHealthKit({
      requestAuthorization: jest.fn(async () => { throw new Error('restricted'); }),
      getRequestStatusForAuthorization: jest.fn(async () => 1),
    });
    await expect(store(hk).connect()).resolves.toBe('not_connected');
  });
});

describe('HealthKit store: readDays', () => {
  it('never queries before the permission request was answered (an unrequested type crashes the app)', async () => {
    const hk = fakeHealthKit({ getRequestStatusForAuthorization: jest.fn(async () => 1) });

    const days = await store(hk).readDays('2026-11-11', '2026-11-12');

    expect(days).toEqual([
      { day: '2026-11-11', tz: 'Europe/Kyiv', platform: 'ios' },
      { day: '2026-11-12', tz: 'Europe/Kyiv', platform: 'ios' },
    ]);
    for (const query of [hk.queryStatisticsCollectionForQuantity, hk.queryQuantitySamples, hk.queryCategorySamples, hk.queryWorkoutSamples]) {
      expect(query).not.toHaveBeenCalled();
    }
  });

  it('turns HealthKit results into health days', async () => {
    const hk = fakeHealthKit({
      queryStatisticsCollectionForQuantity: jest.fn(async (identifier: string) => {
        if (identifier === 'HKQuantityTypeIdentifierStepCount') {
          return [
            { startDate: at('2026-11-11T00:00:00'), sumQuantity: { quantity: 8421, unit: 'count' }, sources: [] },
            { startDate: at('2026-11-12T00:00:00'), sources: [] }, // a day with no samples has no sum
          ];
        }
        if (identifier === 'HKQuantityTypeIdentifierActiveEnergyBurned') {
          return [{ startDate: at('2026-11-11T00:00:00'), sumQuantity: { quantity: 512.44, unit: 'kcal' }, sources: [] }];
        }
        return [{ startDate: at('2026-11-12T00:00:00'), averageQuantity: { quantity: 58, unit: 'count/min' }, sources: [] }];
      }),
      queryQuantitySamples: jest.fn(async () => [{ startDate: at('2026-11-12T07:05:00'), quantity: 78.25 }]),
      queryCategorySamples: jest.fn(async () => [
        { startDate: at('2026-11-11T22:50:00'), endDate: at('2026-11-12T07:00:00'), value: 0 }, // in bed
        { startDate: at('2026-11-11T23:00:00'), endDate: at('2026-11-12T03:00:00'), value: 3 }, // core
        { startDate: at('2026-11-12T03:00:00'), endDate: at('2026-11-12T03:20:00'), value: 2 }, // awake
        { startDate: at('2026-11-12T03:20:00'), endDate: at('2026-11-12T06:50:00'), value: 5 }, // REM
      ]),
      queryWorkoutSamples: jest.fn(async () => [
        {
          startDate: at('2026-11-11T18:00:00'),
          endDate: at('2026-11-11T18:42:00'),
          workoutActivityType: 37,
          totalEnergyBurned: { quantity: 430.5, unit: 'kcal' },
          sourceRevision: { source: { bundleIdentifier: 'com.apple.health', name: 'Watch' } },
        },
        {
          startDate: at('2026-11-12T07:30:00'),
          endDate: at('2026-11-12T07:45:00'),
          workoutActivityType: 20,
          sourceRevision: { source: { bundleIdentifier: 'app.aurafit.mobile', name: 'Aura Fit' } },
        },
        { startDate: at('2026-11-12T12:00:00'), endDate: at('2026-11-12T12:30:00'), workoutActivityType: 9999 },
      ]),
    });

    expect(await store(hk).readDays('2026-11-11', '2026-11-12')).toEqual([
      {
        day: '2026-11-11',
        tz: 'Europe/Kyiv',
        platform: 'ios',
        steps: 8421,
        active_energy_kcal: 512.4,
        external_workouts: [{ type: 'running', minutes: 42, energy_kcal: 430.5 }],
      },
      {
        day: '2026-11-12',
        tz: 'Europe/Kyiv',
        platform: 'ios',
        resting_hr_bpm: 58,
        sleep_minutes: 450,
        weight_kg: 78.3,
        external_workouts: [{ type: 'other', minutes: 30 }],
      },
    ]);
  });

  it('asks for whole local days, and for sleep from the evening before the first day', async () => {
    const hk = fakeHealthKit();
    await store(hk).readDays('2026-11-11', '2026-11-12');

    const [identifier, statistics, anchor, interval, options] = hk.queryStatisticsCollectionForQuantity.mock.calls[0]!;
    expect(identifier).toBe('HKQuantityTypeIdentifierStepCount');
    expect(statistics).toEqual(['cumulativeSum']);
    expect(anchor).toEqual(at('2026-11-11T00:00:00'));
    expect(interval).toEqual({ day: 1 });
    expect(options.filter.date).toMatchObject({ startDate: at('2026-11-11T00:00:00'), endDate: at('2026-11-13T00:00:00') });

    const sleepOptions = hk.queryCategorySamples.mock.calls[0]![1];
    expect(sleepOptions.filter.date.startDate).toEqual(at('2026-11-10T12:00:00'));
  });

  it('asks each measurement for the right statistic and unit, and for every sample', async () => {
    const hk = fakeHealthKit();
    await store(hk).readDays('2026-11-11', '2026-11-12');

    const statistics = hk.queryStatisticsCollectionForQuantity.mock.calls.map(([identifier, stats, , , options]) => [identifier, stats, options.unit, options.filter.date.strictStartDate]);
    expect(statistics).toEqual([
      ['HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], 'count', true],
      ['HKQuantityTypeIdentifierActiveEnergyBurned', ['cumulativeSum'], 'kcal', true],
      ['HKQuantityTypeIdentifierRestingHeartRate', ['discreteAverage'], 'count/min', true],
    ]);
    // limit 0 means "no limit" in the library; any positive number would silently drop samples.
    expect(hk.queryQuantitySamples.mock.calls[0]).toEqual(['HKQuantityTypeIdentifierBodyMass', expect.objectContaining({ limit: 0, unit: 'kg' })]);
    expect(hk.queryCategorySamples.mock.calls[0]).toEqual(['HKCategoryTypeIdentifierSleepAnalysis', expect.objectContaining({ limit: 0 })]);
    expect(hk.queryWorkoutSamples.mock.calls[0]![0]).toMatchObject({ limit: 0 });
  });

  it.each([
    [52, 'walking'], [24, 'walking'], [37, 'running'], [13, 'cycling'], [46, 'swimming'], [50, 'strength'], [20, 'strength'],
    [59, 'strength'], [63, 'hiit'], [73, 'hiit'], [57, 'yoga'], [66, 'yoga'], [62, 'yoga'], [29, 'yoga'], [3000, 'other'], [16, 'other'],
  ])('reads HealthKit activity %s as %s', async (activity, type) => {
    const hk = fakeHealthKit({
      queryWorkoutSamples: jest.fn(async () => [{ startDate: at('2026-11-12T10:00:00'), endDate: at('2026-11-12T10:30:00'), workoutActivityType: activity }]),
    });
    const [day] = await store(hk).readDays('2026-11-12', '2026-11-12');
    expect(day!.external_workouts).toEqual([{ type, minutes: 30 }]);
  });

  it('reads a failed query as no data instead of failing the whole read', async () => {
    const hk = fakeHealthKit({
      queryStatisticsCollectionForQuantity: jest.fn(async () => { throw new Error('denied'); }),
      queryWorkoutSamples: jest.fn(async () => { throw new Error('denied'); }),
      queryQuantitySamples: jest.fn(async () => [{ startDate: at('2026-11-12T07:05:00'), quantity: 80 }]),
    });
    const days = await store(hk).readDays('2026-11-12', '2026-11-12');
    expect(days).toEqual([{ day: '2026-11-12', tz: 'Europe/Kyiv', platform: 'ios', weight_kg: 80 }]);
  });
});

describe('HealthKit store: readDaysChecked', () => {
  it('says the read was complete when every query answered, even with no data', async () => {
    expect((await store(fakeHealthKit()).readDaysChecked('2026-11-12', '2026-11-12')).complete).toBe(true);
  });

  it('says the read was not complete when a query failed, so the gap is never mistaken for "no data"', async () => {
    const hk = fakeHealthKit({ queryCategorySamples: jest.fn(async () => { throw new Error('protected data unavailable'); }) });
    const result = await store(hk).readDaysChecked('2026-11-12', '2026-11-12');
    expect(result.complete).toBe(false);
    expect(result.days).toHaveLength(1);
  });

  it('is not complete before the permission request was answered', async () => {
    const hk = fakeHealthKit({ getRequestStatusForAuthorization: jest.fn(async () => 1) });
    expect((await store(hk).readDaysChecked('2026-11-12', '2026-11-12')).complete).toBe(false);
  });
});

describe('HealthKit store: profile hints', () => {
  it('offers the latest weight and the date of birth', async () => {
    const hk = fakeHealthKit({
      getMostRecentQuantitySample: jest.fn(async () => ({ quantity: 78.26 })),
      getDateOfBirthAsync: jest.fn(async () => at('1990-04-15T00:00:00')),
    });
    expect(await store(hk).readProfileHints()).toEqual({ weightKg: 78.3, dateOfBirth: '1990-04-15' });
  });

  it('offers nothing when not connected, and only what could be read otherwise', async () => {
    const notConnected = fakeHealthKit({ getRequestStatusForAuthorization: jest.fn(async () => 1) });
    expect(await store(notConnected).readProfileHints()).toEqual({});
    expect(notConnected.getDateOfBirthAsync).not.toHaveBeenCalled();

    const partial = fakeHealthKit({
      getMostRecentQuantitySample: jest.fn(async () => { throw new Error('denied'); }),
      getDateOfBirthAsync: jest.fn(async () => at('1990-04-15T00:00:00')),
    });
    expect(await store(partial).readProfileHints()).toEqual({ dateOfBirth: '1990-04-15' });
  });
});

describe('HealthKit store: writing workouts', () => {
  const workout = { start: at('2026-11-12T07:30:00'), end: at('2026-11-12T07:45:00'), kind: 'strength' as const, title: 'Full body', energyKcal: 96.5 };

  it('saves the workout with its energy and returns the record id', async () => {
    const hk = fakeHealthKit();

    expect(await store(hk).writeWorkout(workout)).toBe('HK-UUID-1');

    const [type, quantities, start, end] = hk.saveWorkoutSample.mock.calls[0]!;
    expect(type).toBe(20); // functional strength training
    expect(quantities).toEqual([
      { quantityType: 'HKQuantityTypeIdentifierActiveEnergyBurned', quantity: 96.5, unit: 'kcal', startDate: workout.start, endDate: workout.end },
    ]);
    expect([start, end]).toEqual([workout.start, workout.end]);
  });

  it('maps each kind of session to a HealthKit activity', async () => {
    const hk = fakeHealthKit();
    await store(hk).writeWorkout({ ...workout, kind: 'hiit' });
    await store(hk).writeWorkout({ ...workout, kind: 'mobility' });
    expect(hk.saveWorkoutSample.mock.calls.map((call) => call[0])).toEqual([63, 62]);
  });

  it('writes nothing and returns null when writing workouts is not allowed', async () => {
    const hk = fakeHealthKit({ authorizationStatusFor: jest.fn(() => 1) });
    expect(await store(hk).writeWorkout(workout)).toBeNull();
    expect(hk.saveWorkoutSample).not.toHaveBeenCalled();
  });

  it('saves the workout without energy when only energy writing is denied', async () => {
    const hk = fakeHealthKit({
      authorizationStatusFor: jest.fn((type: string) => (type === 'HKWorkoutTypeIdentifier' ? 2 : 1)),
    });
    expect(await store(hk).writeWorkout(workout)).toBe('HK-UUID-1');
    expect(hk.saveWorkoutSample.mock.calls[0]![1]).toEqual([]);
  });

  it('returns null when the save fails', async () => {
    const hk = fakeHealthKit({ saveWorkoutSample: jest.fn(async () => { throw new Error('disk'); }) });
    expect(await store(hk).writeWorkout(workout)).toBeNull();
  });

  it('deletes the energy written with the workout, then the workout itself', async () => {
    // Found on the simulator: deleting a workout leaves its energy samples behind in Health.
    const workoutProxy = { uuid: 'HK-UUID-1' };
    const hk = fakeHealthKit({ queryWorkoutSamples: jest.fn(async () => [workoutProxy]) });

    await store(hk).deleteWorkout('HK-UUID-1');

    expect(hk.queryWorkoutSamples).toHaveBeenCalledWith({ filter: { uuid: 'HK-UUID-1' }, limit: 1 });
    expect(hk.deleteObjects.mock.calls).toEqual([
      ['HKQuantityTypeIdentifierActiveEnergyBurned', { workout: workoutProxy }],
      ['HKWorkoutTypeIdentifier', { uuid: 'HK-UUID-1' }],
    ]);
  });

  it('still deletes the workout when its energy cannot be found or removed', async () => {
    const gone = fakeHealthKit({ queryWorkoutSamples: jest.fn(async () => []) });
    await store(gone).deleteWorkout('HK-UUID-1');
    expect(gone.deleteObjects.mock.calls).toEqual([['HKWorkoutTypeIdentifier', { uuid: 'HK-UUID-1' }]]);

    const failing = fakeHealthKit({
      queryWorkoutSamples: jest.fn(async () => [{ uuid: 'HK-UUID-1' }]),
      deleteObjects: jest.fn(async (type: string) => {
        if (type !== 'HKWorkoutTypeIdentifier') throw new Error('not authorized');
        return 1;
      }),
    });
    await expect(store(failing).deleteWorkout('HK-UUID-1')).resolves.toBeUndefined();
    expect(failing.deleteObjects).toHaveBeenLastCalledWith('HKWorkoutTypeIdentifier', { uuid: 'HK-UUID-1' });
  });
});
