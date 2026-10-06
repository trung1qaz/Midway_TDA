// Small in-memory cache keyed by request (URL). Lives for the lifetime of the
// server process; nothing is written to disk. Concurrent lookups for the same
// key share one in-flight promise, so a cache miss never triggers two
// upstream requests. Failed lookups are not cached.

export interface AsyncCache<T> {
  get(key: string, load: () => Promise<T>): Promise<T>;
  readonly size: number;
}

export function createCache<T>(opts: { ttlMs: number; maxEntries: number }): AsyncCache<T> {
  const entries = new Map<string, { value: Promise<T>; expires: number }>();

  return {
    get(key, load) {
      const now = Date.now();
      const hit = entries.get(key);
      if (hit && hit.expires > now) return hit.value;
      if (hit) entries.delete(key);

      const value = load();
      entries.set(key, { value, expires: now + opts.ttlMs });
      value.catch(() => entries.delete(key));

      // Map preserves insertion order, so the first key is the oldest.
      while (entries.size > opts.maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      return value;
    },
    get size() {
      return entries.size;
    },
  };
}
