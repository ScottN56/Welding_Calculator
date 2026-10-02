export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** In-memory store used for tests and when localStorage is unavailable (e.g. private mode). */
export function createMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

export function getDefaultStore(): KeyValueStore {
  try {
    const store = globalThis.localStorage;
    const probe = '__weldcalc_probe__';
    store.setItem(probe, probe);
    store.removeItem(probe);
    return store;
  } catch {
    return createMemoryStore();
  }
}

/** Parses stored JSON; returns null when missing, corrupt, or rejected by `parse`. */
export function readJson<T>(store: KeyValueStore, key: string, parse: (raw: unknown) => T | null): T | null {
  try {
    const text = store.getItem(key);
    return text === null ? null : parse(JSON.parse(text));
  } catch {
    return null;
  }
}

/** Returns false if the write failed (e.g. storage quota exceeded). */
export function writeJson(store: KeyValueStore, key: string, value: unknown): boolean {
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
