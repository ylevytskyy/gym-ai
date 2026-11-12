import { createHealthController, type Preferences } from './controller';
import { createFakeHealthStore, type FakeHealthOptions } from './fake-store';

function memoryPreferences(initial: Record<string, string> = {}): Preferences & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, get: async (key) => data.get(key) ?? null, set: async (key, value) => void data.set(key, value) };
}

function setup(options: FakeHealthOptions = {}, stored: Record<string, string> = {}) {
  const store = createFakeHealthStore(options);
  const preferences = memoryPreferences(stored);
  return { store, preferences, controller: createHealthController(store, preferences) };
}

const now = new Date('2026-11-12T10:00:00');
const withSteps = { steps: [{ day: '2026-11-12', value: 4200 }], activeEnergyKcal: [], restingHrBpm: [], weightKg: [], sleep: [], workouts: [] };

describe('health controller', () => {
  it('starts off, and reads nothing before the user connects', async () => {
    const { controller } = setup({ raw: withSteps, hints: { weightKg: 78 } });

    expect(await controller.state()).toBe('off');
    expect(await controller.readToday(now)).toBeNull();
    expect(await controller.readDays('2026-11-01', '2026-11-12')).toEqual([]);
    expect(await controller.readProfileHints()).toEqual({});
  });

  it('connects when the user grants access, and then reads', async () => {
    const { controller, store } = setup({ raw: withSteps, hints: { weightKg: 78 } });

    expect(await controller.connect()).toBe('connected');
    expect(store.connectCalls).toBe(1);
    expect(await controller.readToday(now)).toMatchObject({ day: '2026-11-12', steps: 4200 });
    expect(await controller.readProfileHints()).toEqual({ weightKg: 78 });
  });

  it('remembers the connection across launches', async () => {
    const { store, preferences } = setup();
    await createHealthController(store, preferences).connect();
    expect(await createHealthController(store, preferences).state()).toBe('connected');
  });

  it('reports unavailable and needs update whatever was stored', async () => {
    expect(await setup({ initial: 'unavailable' }, { 'health.enabled': 'true' }).controller.state()).toBe('unavailable');
    expect(await setup({ initial: 'needs_update' }).controller.state()).toBe('needs_update');
    expect(await setup({ initial: 'unavailable' }).controller.connect()).toBe('unavailable');
  });

  it('is denied on Android after a refused request, and stays denied on the next launch', async () => {
    const { controller, store, preferences } = setup({ platform: 'android', grants: false });

    expect(await controller.connect()).toBe('denied');
    expect(await createHealthController(store, preferences).state()).toBe('denied');
    expect(await controller.readToday(now)).toBeNull();
  });

  it('is off, not denied, on iOS when a request still needs showing after one was answered', async () => {
    // A new app version asks for a new type: HealthKit wants the request shown again.
    const { controller } = setup({ platform: 'ios' }, { 'health.asked': 'true', 'health.enabled': 'true' });
    expect(await controller.state()).toBe('off');
  });

  it('stops reading and writing after disconnect, although the system access is still there', async () => {
    const { controller, store } = setup({ raw: withSteps });
    await controller.connect();

    expect(await controller.disconnect()).toBe('off');
    expect(await store.status()).toBe('connected');
    expect(await controller.readToday(now)).toBeNull();
    expect(await controller.writeWorkout({ start: now, end: new Date(now.getTime() + 600_000), kind: 'strength', title: 'x' })).toBeNull();
    expect(store.written).toHaveLength(0);
  });

  it('does not start reading just because the system already allows it: the user has to connect here', async () => {
    const { controller, store, preferences } = setup({ initial: 'connected', raw: withSteps, hints: { weightKg: 78 } });
    expect(await controller.state()).toBe('off');
    expect(await controller.readProfileHints()).toEqual({});
    expect(store.connectCalls).toBe(0);
    expect(preferences.data.get('health.enabled')).toBeUndefined();
  });

  it('stores the choice as off when the request was refused', async () => {
    const { controller, preferences } = setup({ platform: 'android', grants: false });
    await controller.connect();
    expect(preferences.data.get('health.enabled')).toBe('false');
    expect(preferences.data.get('health.asked')).toBe('true');
  });

  it('offers no profile values after disconnect', async () => {
    const { controller } = setup({ hints: { weightKg: 78 } });
    await controller.connect();
    await controller.disconnect();
    expect(await controller.readProfileHints()).toEqual({});
    expect(await controller.readDays('2026-11-01', '2026-11-12')).toEqual([]);
  });

  it('reconnects without a new system request when access was already given', async () => {
    const { controller } = setup();
    await controller.connect();
    await controller.disconnect();
    expect(await controller.connect()).toBe('connected');
  });

  it('writes a workout when connected and returns its record id', async () => {
    const { controller, store } = setup();
    await controller.connect();
    const id = await controller.writeWorkout({ start: now, end: new Date(now.getTime() + 600_000), kind: 'hiit', title: 'Cardio' });
    expect(id).toBe('fake-1');
    expect(store.written).toHaveLength(1);
  });

  it('treats unreadable preferences as off and still lets the user connect', async () => {
    const store = createFakeHealthStore({ initial: 'connected' });
    const broken: Preferences = { get: async () => { throw new Error('storage'); }, set: async () => { throw new Error('storage'); } };
    const controller = createHealthController(store, broken);
    expect(await controller.state()).toBe('off');
    await expect(controller.connect()).resolves.toBe('off');
  });

  it('opens the system settings through the store', async () => {
    const { controller, store } = setup();
    await controller.openSettings();
    expect(store.settingsOpened).toBe(1);
  });
});
