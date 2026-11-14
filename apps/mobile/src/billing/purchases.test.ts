import type { CustomerInfo } from 'react-native-purchases';

const mockPurchases = { configure: jest.fn(), logIn: jest.fn(async () => ({})), logOut: jest.fn(async () => ({})) };
jest.mock('react-native-purchases', () => ({ __esModule: true, default: mockPurchases }));

type Module = typeof import('./purchases');

/** A fresh copy of the module, so its "configured" and "logged once" state starts clean. */
function load(key: string | undefined): Module {
  if (key === undefined) delete process.env.EXPO_PUBLIC_REVENUECAT_PUBLIC_KEY;
  else process.env.EXPO_PUBLIC_REVENUECAT_PUBLIC_KEY = key;
  let loaded!: Module;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh module copy needs require
    loaded = require('./purchases') as Module;
  });
  return loaded;
}

const info = (active: Record<string, unknown>) => ({ entitlements: { active } }) as unknown as CustomerInfo;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('without a RevenueCat key', () => {
  it.each([undefined, '', '   '])('does nothing and never throws (key %j)', async (key) => {
    const billing = load(key);
    expect(() => billing.configure()).not.toThrow();
    await expect(billing.identify('user-1')).resolves.toBeUndefined();
    await expect(billing.logOut()).resolves.toBeUndefined();
    expect(mockPurchases.configure).not.toHaveBeenCalled();
    expect(mockPurchases.logIn).not.toHaveBeenCalled();
    expect(mockPurchases.logOut).not.toHaveBeenCalled();
  });

  it('logs that billing is off only once', () => {
    const billing = load(undefined);
    billing.configure();
    billing.configure();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});

describe('with a RevenueCat key', () => {
  it('configures the SDK with the key, once', () => {
    const billing = load('appl_test_key');
    billing.configure();
    billing.configure();
    expect(mockPurchases.configure).toHaveBeenCalledTimes(1);
    expect(mockPurchases.configure).toHaveBeenCalledWith({ apiKey: 'appl_test_key' });
  });

  it('identifies the person by their Supabase user id', async () => {
    const billing = load('appl_test_key');
    billing.configure();
    await billing.identify('3f2c-user-id');
    expect(mockPurchases.logIn).toHaveBeenCalledWith('3f2c-user-id');
  });

  it('logs out on sign-out', async () => {
    const billing = load('appl_test_key');
    billing.configure();
    await billing.logOut();
    expect(mockPurchases.logOut).toHaveBeenCalledTimes(1);
  });

  it('does not call the SDK before it is configured', async () => {
    const billing = load('appl_test_key');
    await billing.identify('user-1');
    await billing.logOut();
    expect(mockPurchases.logIn).not.toHaveBeenCalled();
    expect(mockPurchases.logOut).not.toHaveBeenCalled();
  });

  it('swallows an SDK failure: billing must never break sign-in', async () => {
    const billing = load('appl_test_key');
    billing.configure();
    mockPurchases.logIn.mockRejectedValueOnce(new Error('offline'));
    mockPurchases.logOut.mockRejectedValueOnce(new Error('offline'));
    await expect(billing.identify('user-1')).resolves.toBeUndefined();
    await expect(billing.logOut()).resolves.toBeUndefined();
  });
});

describe('hasPro', () => {
  const { hasPro, PRO_ENTITLEMENT } = load(undefined);

  it('names the entitlement "pro"', () => expect(PRO_ENTITLEMENT).toBe('pro'));
  it('is true when the pro entitlement is active', () => expect(hasPro(info({ pro: { isActive: true } }))).toBe(true));
  it('is false when only another entitlement is active', () => expect(hasPro(info({ other: {} }))).toBe(false));
  it('is false when nothing is active', () => expect(hasPro(info({}))).toBe(false));
  it('is false when the entitlements are missing', () => {
    expect(hasPro({} as unknown as CustomerInfo)).toBe(false);
    expect(hasPro(null)).toBe(false);
    expect(hasPro(undefined)).toBe(false);
  });
});
