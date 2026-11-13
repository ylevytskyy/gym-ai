import { createHealthConnectStore, HEALTH_CONNECT_ACCESS, type HealthConnectApi } from './health-connect-store';

const at = (iso: string) => new Date(iso);
const APP_ID = 'app.aurafit.mobile';

type Fake = { [K in keyof HealthConnectApi]: jest.Mock };

const allGranted = () => HEALTH_CONNECT_ACCESS.map((p) => ({ ...p }));

function fakeHealthConnect(overrides: Partial<Fake> = {}): Fake {
  return {
    getSdkStatus: jest.fn(async () => 3),
    initialize: jest.fn(async () => true),
    requestPermission: jest.fn(async () => allGranted()),
    getGrantedPermissions: jest.fn(async () => allGranted()),
    aggregateRecord: jest.fn(async () => ({ dataOrigins: [] })),
    aggregateGroupByDuration: jest.fn(async () => []),
    readRecords: jest.fn(async () => ({ records: [] })),
    insertRecords: jest.fn(async () => ['HC-ID-1']),
    deleteRecordsByUuids: jest.fn(async () => undefined),
    openHealthConnectSettings: jest.fn(),
    ...overrides,
  };
}

const store = (hc: Fake) => createHealthConnectStore(hc as unknown as HealthConnectApi, APP_ID, () => 'Europe/Kyiv');

describe('Health Connect store: status and connect', () => {
  it('reports unavailable, needs update, not connected and connected', async () => {
    expect(await store(fakeHealthConnect({ getSdkStatus: jest.fn(async () => 1) })).status()).toBe('unavailable');
    expect(await store(fakeHealthConnect({ getSdkStatus: jest.fn(async () => 2) })).status()).toBe('needs_update');
    expect(await store(fakeHealthConnect({ getGrantedPermissions: jest.fn(async () => []) })).status()).toBe('not_connected');
    expect(await store(fakeHealthConnect()).status()).toBe('connected');
    expect(await store(fakeHealthConnect({ getSdkStatus: jest.fn(async () => { throw new Error('no module'); }) })).status()).toBe('unavailable');
  });

  it('initialises the client once before any other call', async () => {
    const hc = fakeHealthConnect();
    const s = store(hc);
    await s.status();
    await s.status();
    expect(hc.initialize).toHaveBeenCalledTimes(1);
    expect(hc.initialize.mock.invocationCallOrder[0]!).toBeLessThan(hc.getGrantedPermissions.mock.invocationCallOrder[0]!);
  });

  it('asks for exactly the record types this build reads and writes', async () => {
    const hc = fakeHealthConnect();
    await store(hc).connect();

    expect(hc.requestPermission).toHaveBeenCalledWith(HEALTH_CONNECT_ACCESS);
    const list = HEALTH_CONNECT_ACCESS.map((p) => `${p.accessType}:${p.recordType}`).sort();
    expect(list).toEqual([
      'read:ActiveCaloriesBurned',
      'read:ExerciseSession',
      'read:RestingHeartRate',
      'read:SleepSession',
      'read:Steps',
      'read:Weight',
      'write:ActiveCaloriesBurned',
      'write:ExerciseSession',
    ]);
  });

  it('does not ask when Health Connect is missing, and survives a failed request', async () => {
    const missing = fakeHealthConnect({ getSdkStatus: jest.fn(async () => 2) });
    expect(await store(missing).connect()).toBe('needs_update');
    expect(missing.requestPermission).not.toHaveBeenCalled();

    const failing = fakeHealthConnect({
      requestPermission: jest.fn(async () => { throw new Error('activity gone'); }),
      getGrantedPermissions: jest.fn(async () => []),
    });
    await expect(store(failing).connect()).resolves.toBe('not_connected');
  });

  it('opens Health Connect settings', async () => {
    const hc = fakeHealthConnect();
    await store(hc).openSettings();
    expect(hc.openHealthConnectSettings).toHaveBeenCalled();
  });
});

describe('Health Connect store: readDays', () => {
  it('turns Health Connect results into health days', async () => {
    const hc = fakeHealthConnect({
      aggregateRecord: jest.fn(async ({ recordType, timeRangeFilter }: { recordType: string; timeRangeFilter: { startTime: string } }) => {
        const eleventh = timeRangeFilter.startTime === at('2026-11-11T00:00:00').toISOString();
        if (recordType === 'Steps') return eleventh ? { COUNT_TOTAL: 2310, dataOrigins: ['com.google.android.apps.fitness'] } : { COUNT_TOTAL: 0, dataOrigins: [] };
        if (recordType === 'ActiveCaloriesBurned') return eleventh ? { ACTIVE_CALORIES_TOTAL: { inKilocalories: 201.26 }, dataOrigins: ['x'] } : { dataOrigins: [] };
        return eleventh ? { dataOrigins: [] } : { BPM_AVG: 61, dataOrigins: ['x'] };
      }),
      readRecords: jest.fn(async (recordType: string) => {
        if (recordType === 'Weight') return { records: [{ time: at('2026-11-12T07:00:00').toISOString(), weight: { inKilograms: 88.04 } }] };
        if (recordType === 'SleepSession') {
          return {
            records: [
              { startTime: at('2026-11-10T23:30:00').toISOString(), endTime: at('2026-11-11T06:05:00').toISOString() }, // no stages
              {
                startTime: at('2026-11-11T23:00:00').toISOString(),
                endTime: at('2026-11-12T07:00:00').toISOString(),
                stages: [
                  { startTime: at('2026-11-11T23:00:00').toISOString(), endTime: at('2026-11-12T03:00:00').toISOString(), stage: 4 },
                  { startTime: at('2026-11-12T03:00:00').toISOString(), endTime: at('2026-11-12T03:30:00').toISOString(), stage: 1 }, // awake
                  { startTime: at('2026-11-12T03:30:00').toISOString(), endTime: at('2026-11-12T07:00:00').toISOString(), stage: 6 },
                ],
              },
            ],
          };
        }
        return {
          records: [
            { startTime: at('2026-11-11T18:00:00').toISOString(), endTime: at('2026-11-11T18:45:00').toISOString(), exerciseType: 8, metadata: { dataOrigin: 'com.strava' } },
            { startTime: at('2026-11-12T07:30:00').toISOString(), endTime: at('2026-11-12T07:45:00').toISOString(), exerciseType: 13, metadata: { dataOrigin: APP_ID } },
          ],
        };
      }),
    });

    expect(await store(hc).readDays('2026-11-11', '2026-11-12')).toEqual([
      {
        day: '2026-11-11',
        tz: 'Europe/Kyiv',
        platform: 'android',
        steps: 2310,
        active_energy_kcal: 201.3,
        sleep_minutes: 395,
        external_workouts: [{ type: 'cycling', minutes: 45 }],
      },
      { day: '2026-11-12', tz: 'Europe/Kyiv', platform: 'android', resting_hr_bpm: 61, sleep_minutes: 450, weight_kg: 88 },
    ]);
  });

  it.each([
    [79, 'walking'], [37, 'walking'], [56, 'running'], [57, 'running'], [8, 'cycling'], [9, 'cycling'], [74, 'swimming'], [73, 'swimming'],
    [70, 'strength'], [81, 'strength'], [13, 'strength'], [36, 'hiit'], [10, 'hiit'], [83, 'yoga'], [48, 'yoga'], [71, 'yoga'], [0, 'other'], [16, 'other'],
  ])('reads Health Connect exercise type %s as %s', async (exerciseType, type) => {
    const hc = fakeHealthConnect({
      readRecords: jest.fn(async (recordType: string) =>
        recordType === 'ExerciseSession'
          ? { records: [{ startTime: at('2026-11-12T10:00:00').toISOString(), endTime: at('2026-11-12T10:30:00').toISOString(), exerciseType, metadata: { dataOrigin: 'com.other' } }] }
          : { records: [] },
      ),
    });
    const [day] = await store(hc).readDays('2026-11-12', '2026-11-12');
    expect(day!.external_workouts).toEqual([{ type, minutes: 30 }]);
  });

  it('aggregates each local day separately', async () => {
    const hc = fakeHealthConnect();
    await store(hc).readDays('2026-10-24', '2026-10-26'); // the 25th is a 25-hour day in Kyiv

    const stepRanges = hc.aggregateRecord.mock.calls.filter(([req]) => req.recordType === 'Steps').map(([req]) => req.timeRangeFilter);
    expect(stepRanges).toEqual([
      { operator: 'between', startTime: at('2026-10-24T00:00:00').toISOString(), endTime: at('2026-10-25T00:00:00').toISOString() },
      { operator: 'between', startTime: at('2026-10-25T00:00:00').toISOString(), endTime: at('2026-10-26T00:00:00').toISOString() },
      { operator: 'between', startTime: at('2026-10-26T00:00:00').toISOString(), endTime: at('2026-10-27T00:00:00').toISOString() },
    ]);
    const hours = (r: { startTime: string; endTime: string }) => (Date.parse(r.endTime) - Date.parse(r.startTime)) / 3_600_000;
    expect(stepRanges.map(hours)).toEqual([24, 25, 24]);
  });

  it('only reads the record types the user granted (reading another one throws)', async () => {
    const hc = fakeHealthConnect({
      getGrantedPermissions: jest.fn(async () => [{ accessType: 'read', recordType: 'Steps' }]),
      aggregateRecord: jest.fn(async () => ({ COUNT_TOTAL: 500, dataOrigins: ['x'] })),
    });

    const days = await store(hc).readDays('2026-11-12', '2026-11-12');

    expect(days).toEqual([{ day: '2026-11-12', tz: 'Europe/Kyiv', platform: 'android', steps: 500 }]);
    expect(hc.aggregateRecord.mock.calls.map(([req]) => req.recordType)).toEqual(['Steps']);
    expect(hc.readRecords).not.toHaveBeenCalled();
  });

  it('reads a failed call as no data, and nothing at all when Health Connect is unavailable', async () => {
    const failing = fakeHealthConnect({
      aggregateRecord: jest.fn(async () => { throw new Error('SecurityException'); }),
      readRecords: jest.fn(async () => { throw new Error('SecurityException'); }),
    });
    expect(await store(failing).readDays('2026-11-12', '2026-11-12')).toEqual([{ day: '2026-11-12', tz: 'Europe/Kyiv', platform: 'android' }]);

    const missing = fakeHealthConnect({ getSdkStatus: jest.fn(async () => 1) });
    expect(await store(missing).readDays('2026-11-12', '2026-11-12')).toEqual([{ day: '2026-11-12', tz: 'Europe/Kyiv', platform: 'android' }]);
    expect(missing.aggregateRecord).not.toHaveBeenCalled();
  });
});

describe('Health Connect store: readDaysChecked', () => {
  it('is complete when every permitted read answered, and types without permission do not count against it', async () => {
    expect((await store(fakeHealthConnect()).readDaysChecked('2026-11-12', '2026-11-12')).complete).toBe(true);
    const stepsOnly = fakeHealthConnect({ getGrantedPermissions: jest.fn(async () => [{ accessType: 'read', recordType: 'Steps' }]) });
    expect((await store(stepsOnly).readDaysChecked('2026-11-12', '2026-11-12')).complete).toBe(true);
  });

  it('is not complete when a read failed or Health Connect is unavailable', async () => {
    const failing = fakeHealthConnect({ readRecords: jest.fn(async () => { throw new Error('IPC'); }) });
    expect((await store(failing).readDaysChecked('2026-11-12', '2026-11-12')).complete).toBe(false);
    const oneDayFails = fakeHealthConnect({ aggregateRecord: jest.fn(async () => { throw new Error('rate limited'); }) });
    expect((await store(oneDayFails).readDaysChecked('2026-11-12', '2026-11-12')).complete).toBe(false);
    const missing = fakeHealthConnect({ getSdkStatus: jest.fn(async () => 1) });
    expect((await store(missing).readDaysChecked('2026-11-12', '2026-11-12')).complete).toBe(false);
  });
});

describe('Health Connect store: profile hints', () => {
  it('offers the latest weight and never a date of birth', async () => {
    const hc = fakeHealthConnect({ readRecords: jest.fn(async () => ({ records: [{ time: '2026-11-12T05:00:00Z', weight: { inKilograms: 88.04 } }] })) });
    expect(await store(hc).readProfileHints()).toEqual({ weightKg: 88 });
    expect(hc.readRecords.mock.calls[0]![1]).toMatchObject({ ascendingOrder: false, pageSize: 1 });
  });

  it('offers nothing without the weight permission', async () => {
    const hc = fakeHealthConnect({ getGrantedPermissions: jest.fn(async () => [{ accessType: 'read', recordType: 'Steps' }]) });
    expect(await store(hc).readProfileHints()).toEqual({});
    expect(hc.readRecords).not.toHaveBeenCalled();
  });
});

describe('Health Connect store: writing workouts', () => {
  const workout = { start: at('2026-11-12T07:30:00'), end: at('2026-11-12T07:45:00'), kind: 'strength' as const, title: 'Full body', energyKcal: 96.5 };

  it('inserts the session, then its energy linked to the session id, and returns the id', async () => {
    const hc = fakeHealthConnect();

    expect(await store(hc).writeWorkout(workout)).toBe('HC-ID-1');

    expect(hc.insertRecords.mock.calls[0]![0]).toEqual([
      { recordType: 'ExerciseSession', startTime: workout.start.toISOString(), endTime: workout.end.toISOString(), exerciseType: 13, title: 'Full body' },
    ]);
    expect(hc.insertRecords.mock.calls[1]![0]).toEqual([
      {
        recordType: 'ActiveCaloriesBurned',
        startTime: workout.start.toISOString(),
        endTime: workout.end.toISOString(),
        energy: { value: 96.5, unit: 'kilocalories' },
        metadata: { clientRecordId: 'energy-HC-ID-1' },
      },
    ]);
  });

  it('writes nothing and returns null without the exercise write permission', async () => {
    const hc = fakeHealthConnect({ getGrantedPermissions: jest.fn(async () => [{ accessType: 'read', recordType: 'Steps' }]) });
    expect(await store(hc).writeWorkout(workout)).toBeNull();
    expect(hc.insertRecords).not.toHaveBeenCalled();
  });

  it('writes the session alone when energy writing is not granted or there is no energy', async () => {
    const hc = fakeHealthConnect({ getGrantedPermissions: jest.fn(async () => [{ accessType: 'write', recordType: 'ExerciseSession' }]) });
    expect(await store(hc).writeWorkout(workout)).toBe('HC-ID-1');
    expect(hc.insertRecords).toHaveBeenCalledTimes(1);

    const noEnergy = fakeHealthConnect();
    await store(noEnergy).writeWorkout({ ...workout, energyKcal: undefined });
    expect(noEnergy.insertRecords).toHaveBeenCalledTimes(1);
  });

  it('returns null when the insert fails', async () => {
    const hc = fakeHealthConnect({ insertRecords: jest.fn(async () => { throw new Error('io'); }) });
    expect(await store(hc).writeWorkout(workout)).toBeNull();
  });

  it('deletes the session and the energy that was written with it', async () => {
    const hc = fakeHealthConnect();
    await store(hc).deleteWorkout('HC-ID-1');
    expect(hc.deleteRecordsByUuids).toHaveBeenCalledWith('ExerciseSession', ['HC-ID-1'], []);
    expect(hc.deleteRecordsByUuids).toHaveBeenCalledWith('ActiveCaloriesBurned', [], ['energy-HC-ID-1']);
  });
});

describe('Health Connect store: recent steps', () => {
  const now = at('2026-11-12T09:00:00Z');
  const group = (endIso: string, steps: number, origins: string[] = ['com.google.android.apps.fitness']) => ({
    startTime: new Date(at(endIso).getTime() - 5 * 60_000).toISOString(),
    endTime: endIso,
    result: { COUNT_TOTAL: steps, dataOrigins: origins },
  });

  it('returns the five-minute totals of the last hour with their end times', async () => {
    const hc = fakeHealthConnect({
      aggregateGroupByDuration: jest.fn(async () => [
        group('2026-11-12T03:00:00.000Z', 900),
        group('2026-11-12T08:00:00.000Z', 50), // exactly an hour old
        group('2026-11-12T08:20:00.000Z', 120),
        group('2026-11-12T08:40:00.000Z', 0, []), // an empty stretch is not a reading
        group('2026-11-12T08:55:00.000Z', 30),
      ]),
    });
    expect(await store(hc).readRecentSteps(now)).toEqual([
      { end: at('2026-11-12T08:20:00Z'), steps: 120 },
      { end: at('2026-11-12T08:55:00Z'), steps: 30 },
    ]);
    expect(hc.aggregateGroupByDuration).toHaveBeenCalledWith({
      recordType: 'Steps',
      timeRangeFilter: { operator: 'between', startTime: '2026-11-11T09:00:00.000Z', endTime: '2026-11-12T09:00:00.000Z' },
      timeRangeSlicer: { duration: 'MINUTES', length: 5 },
    });
  });

  it('reads on a fixed five-minute grid and ends the running stretch now', async () => {
    const later = at('2026-11-12T09:02:30Z');
    const hc = fakeHealthConnect({ aggregateGroupByDuration: jest.fn(async () => [group('2026-11-12T09:05:00.000Z', 40)]) });
    expect(await store(hc).readRecentSteps(later)).toEqual([{ end: later, steps: 40 }]);
    expect(hc.aggregateGroupByDuration.mock.calls[0][0].timeRangeFilter.startTime).toBe('2026-11-11T09:00:00.000Z');
  });

  it('is an hour without steps when earlier steps prove that steps can be read', async () => {
    const hc = fakeHealthConnect({ aggregateGroupByDuration: jest.fn(async () => [group('2026-11-12T03:00:00.000Z', 900)]) });
    expect(await store(hc).readRecentSteps(now)).toEqual([]);
  });

  it('is unknown when there were no steps in 24 hours, the read fails, or steps may not be read', async () => {
    expect(await store(fakeHealthConnect()).readRecentSteps(now)).toBeNull();
    const failing = fakeHealthConnect({ aggregateGroupByDuration: jest.fn(async () => { throw new Error('no background access'); }) });
    expect(await store(failing).readRecentSteps(now)).toBeNull();
    const noSteps = fakeHealthConnect({ getGrantedPermissions: jest.fn(async () => allGranted().filter((p) => p.recordType !== 'Steps')) });
    expect(await store(noSteps).readRecentSteps(now)).toBeNull();
    expect(noSteps.aggregateGroupByDuration).not.toHaveBeenCalled();
    expect(await store(fakeHealthConnect({ getSdkStatus: jest.fn(async () => 1) })).readRecentSteps(now)).toBeNull();
  });
});

describe('Health Connect store: background reading', () => {
  const background = { accessType: 'read', recordType: 'BackgroundAccessPermission' };

  it('asks for background reading and says whether it was given', async () => {
    const granted = fakeHealthConnect({ requestPermission: jest.fn(async () => [...allGranted(), background]) });
    expect(await store(granted).setBackground(true)).toBe(true);
    expect(granted.requestPermission).toHaveBeenCalledWith([background]);
    expect(await store(fakeHealthConnect()).setBackground(true)).toBe(false);
  });

  it('does not ask again when background reading is already allowed', async () => {
    const hc = fakeHealthConnect({ getGrantedPermissions: jest.fn(async () => [...allGranted(), background]) });
    expect(await store(hc).setBackground(true)).toBe(true);
    expect(hc.requestPermission).not.toHaveBeenCalled();
  });

  it('reports false when Health Connect is missing or the request fails, and turning off asks nothing', async () => {
    expect(await store(fakeHealthConnect({ getSdkStatus: jest.fn(async () => 1) })).setBackground(true)).toBe(false);
    const failing = fakeHealthConnect({ requestPermission: jest.fn(async () => { throw new Error('boom'); }) });
    expect(await store(failing).setBackground(true)).toBe(false);
    const hc = fakeHealthConnect();
    expect(await store(hc).setBackground(false)).toBe(true);
    expect(hc.requestPermission).not.toHaveBeenCalled();
  });

  it('has no step delivery: watching does nothing', () => {
    const handler = jest.fn();
    expect(() => store(fakeHealthConnect()).watchSteps(handler)()).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});
