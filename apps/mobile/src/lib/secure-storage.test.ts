import { createSecureSessionStorage, type KeyValueStore } from './secure-storage';

function memoryStore() {
  const data = new Map<string, string>();
  const store: KeyValueStore = {
    getItemAsync: async (key) => data.get(key) ?? null,
    setItemAsync: async (key, value) => {
      if (!/^[A-Za-z0-9._-]+$/.test(key)) throw new Error(`invalid key ${key}`);
      if (value.length > 2048) throw new Error('value too large');
      data.set(key, value);
    },
    deleteItemAsync: async (key) => {
      data.delete(key);
    },
  };
  return { store, data };
}

describe('secure session storage', () => {
  it('stores and returns a value larger than one entry, including non-ASCII text', async () => {
    const { store } = memoryStore();
    const storage = createSecureSessionStorage(store);
    const session = JSON.stringify({ token: 'x'.repeat(5000), name: 'Олена 🏃' });

    await storage.setItem('sb-127-auth-token', session);

    expect(await storage.getItem('sb-127-auth-token')).toBe(session);
  });

  it('returns null for a key that was never set', async () => {
    expect(await createSecureSessionStorage(memoryStore().store).getItem('missing')).toBeNull();
  });

  it('removes every chunk, and a shorter value leaves nothing of a longer one behind', async () => {
    const { store, data } = memoryStore();
    const storage = createSecureSessionStorage(store);

    await storage.setItem('k', 'a'.repeat(6000));
    await storage.setItem('k', 'short');
    expect(await storage.getItem('k')).toBe('short');
    expect(data.size).toBe(2); // the count and one chunk

    await storage.removeItem('k');
    expect(data.size).toBe(0);
  });

  it('accepts keys with characters the keychain does not allow', async () => {
    const storage = createSecureSessionStorage(memoryStore().store);
    await storage.setItem('sb-http://127.0.0.1:54321-auth-token', 'v');
    expect(await storage.getItem('sb-http://127.0.0.1:54321-auth-token')).toBe('v');
  });

  /** A store whose calls finish in a scrambled order, like a real keychain under load. */
  function slowStore() {
    const { store, data } = memoryStore();
    let tick = 0;
    const delay = () => new Promise<void>((resolve) => setTimeout(resolve, (tick++ * 7) % 5));
    const slow: KeyValueStore = {
      getItemAsync: async (key) => (await delay(), store.getItemAsync(key)),
      setItemAsync: async (key, value) => (await delay(), store.setItemAsync(key, value)),
      deleteItemAsync: async (key) => (await delay(), store.deleteItemAsync(key)),
    };
    return { store: slow, data };
  }

  it('keeps the last value whole when two writes overlap', async () => {
    const storage = createSecureSessionStorage(slowStore().store);
    const first = 'a'.repeat(5000);
    const second = 'b'.repeat(3000);

    await Promise.all([storage.setItem('k', first), storage.setItem('k', second)]);

    expect(await storage.getItem('k')).toBe(second);
  });

  it('is signed out after a removal that was requested after a write, even if they overlap', async () => {
    const { store, data } = slowStore();
    const storage = createSecureSessionStorage(store);

    await Promise.all([storage.setItem('k', 'a'.repeat(5000)), storage.removeItem('k')]);

    expect(await storage.getItem('k')).toBeNull();
    expect(data.size).toBe(0);
  });

  it('writes the chunk count last, so an interrupted write reads as signed out', async () => {
    const { store } = memoryStore();
    const order: string[] = [];
    const recording: KeyValueStore = { ...store, setItemAsync: async (key, value) => (order.push(key), store.setItemAsync(key, value)) };
    await createSecureSessionStorage(recording).setItem('k', 'a'.repeat(4000));
    expect(order[order.length - 1]).toBe('k');
    expect(order.slice(0, -1).every((key) => /^k\.\d+$/.test(key))).toBe(true);
  });

  it('keeps working after a failed write', async () => {
    const { store } = memoryStore();
    let fail = true;
    const flaky: KeyValueStore = { ...store, setItemAsync: async (key, value) => { if (fail) throw new Error('keychain locked'); return store.setItemAsync(key, value); } };
    const storage = createSecureSessionStorage(flaky);
    await expect(storage.setItem('k', 'v')).rejects.toThrow('keychain locked');
    fail = false;
    await storage.setItem('k', 'v2');
    expect(await storage.getItem('k')).toBe('v2');
  });

  it('reads a value with a missing chunk as signed out', async () => {
    const { store, data } = memoryStore();
    const storage = createSecureSessionStorage(store);
    await storage.setItem('k', 'a'.repeat(4000));
    data.delete('k.1');
    expect(await storage.getItem('k')).toBeNull();
  });
});
