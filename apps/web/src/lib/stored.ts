/**
 * What the app keeps on the phone (devices, notes, reports), read so that a
 * change of shape can't lose it (STAB-03, D-044).
 *
 * - The version is in the key (`causewayside.devices.v1`). A new shape gets a
 *   new key, and reads the old key once to carry the data over. The old key
 *   is never deleted or rewritten, so an older build still cached on the
 *   phone keeps working, and going back a version loses nothing.
 * - Anything that can't be read (bad JSON, a reader that throws, or items
 *   the reader had to drop) is copied to `<key>.backup` before the next save
 *   can overwrite it. It can be recovered by hand.
 */
export type Store = Pick<Storage, "getItem" | "setItem">;

/** One stored version: its key, and how to turn what's there into today's shape. */
export interface StoredVersion<T> {
  key: string;
  /** Today's shape from the parsed JSON, or null if it isn't usable. Call `dropped` for any part left out. */
  read: (json: unknown, dropped: () => void) => T | null;
}

export const defaultStore = (): Store | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

const get = (store: Store | undefined, key: string): string | null => {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

/** Keep a copy of something we couldn't fully read, unless it's already kept. */
function backUp(store: Store | undefined, key: string, raw: string) {
  try {
    if (store?.getItem(`${key}.backup`) !== raw) store?.setItem(`${key}.backup`, raw);
  } catch {
    /* no room: nothing more we can do */
  }
}

/**
 * Read the newest version that's there, newest first. Returns null when
 * nothing usable is stored. Older versions are read, never written.
 */
export function loadStored<T>(versions: StoredVersion<T>[], store: Store | undefined = defaultStore()): { value: T; key: string } | null {
  for (const v of versions) {
    const raw = get(store, v.key);
    if (raw === null) continue;
    let lost = false;
    let value: T | null = null;
    try {
      value = v.read(JSON.parse(raw), () => (lost = true));
    } catch {
      value = null;
    }
    if (value === null || lost) backUp(store, v.key, raw);
    if (value !== null) return { value, key: v.key };
  }
  return null;
}

/** Save today's shape under today's key. False if the phone wouldn't store it. */
export function saveStored<T>(key: string, value: T, store: Store | undefined = defaultStore()): boolean {
  try {
    if (!store) return false;
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Read a JSON array item by item, dropping (and reporting) any item `item` can't use. */
export function readList<T>(json: unknown, dropped: () => void, item: (x: unknown) => T | null): T[] | null {
  if (!Array.isArray(json)) return null;
  return json.flatMap((x) => {
    let v: T | null = null;
    try {
      v = item(x);
    } catch {
      v = null;
    }
    if (v === null) dropped();
    return v === null ? [] : [v];
  });
}
