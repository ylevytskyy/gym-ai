/**
 * Session storage for Supabase, kept in the device keychain / keystore.
 *
 * A session is larger than the 2048 bytes one secure-store entry may hold, so a value is split
 * into numbered chunks with a count stored under the key itself.
 */

export interface KeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface SessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Well under the limit, counted in characters of ASCII-safe (URI-encoded) text. */
const CHUNK_SIZE = 1800;

// Secure-store keys may only contain letters, digits, ".", "-" and "_".
const safeKey = (key: string): string => key.replace(/[^A-Za-z0-9._-]/g, '_');
const chunkKey = (key: string, index: number): string => `${safeKey(key)}.${index}`;

export function createSecureSessionStorage(store: KeyValueStore): SessionStorage {
  // A value spans several entries, so two operations on one key must not interleave: each
  // waits for the one before it. A failed operation does not block the ones after it.
  const queues = new Map<string, Promise<unknown>>();
  function inOrder<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = queues.get(key) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    queues.set(key, next.catch(() => undefined));
    return next;
  }

  async function chunkCount(key: string): Promise<number> {
    const count = Number(await store.getItemAsync(safeKey(key)));
    return Number.isInteger(count) && count > 0 ? count : 0;
  }

  async function removeNow(key: string): Promise<void> {
    const count = await chunkCount(key);
    await store.deleteItemAsync(safeKey(key));
    await Promise.all(Array.from({ length: count }, (_, i) => store.deleteItemAsync(chunkKey(key, i))));
  }

  return {
    getItem: (key) =>
      inOrder(key, async () => {
        const count = await chunkCount(key);
        if (count === 0) return null;
        const parts = await Promise.all(Array.from({ length: count }, (_, i) => store.getItemAsync(chunkKey(key, i))));
        // A missing chunk means the value is corrupt: better signed out than a broken session.
        if (parts.some((part) => part === null)) return null;
        try {
          return decodeURIComponent(parts.join(''));
        } catch {
          return null;
        }
      }),

    setItem: (key, value) =>
      inOrder(key, async () => {
        await removeNow(key);
        const encoded = encodeURIComponent(value);
        const count = Math.max(1, Math.ceil(encoded.length / CHUNK_SIZE));
        for (let i = 0; i < count; i++) {
          await store.setItemAsync(chunkKey(key, i), encoded.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
        }
        // Written last: a crash halfway leaves no count, which reads as "no session".
        await store.setItemAsync(safeKey(key), String(count));
      }),

    removeItem: (key) => inOrder(key, () => removeNow(key)),
  };
}
