// Serializes async tasks so that each one *starts* at least `minIntervalMs`
// after the previous one started, and never overlaps the previous one.
// Used to keep Nominatim and OSRM at <= 1 request/second as their usage
// policies require.

export type Throttle = <T>(task: () => Promise<T>) => Promise<T>;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createThrottle(minIntervalMs: number): Throttle {
  let queue: Promise<unknown> = Promise.resolve();
  let lastStart = Number.NEGATIVE_INFINITY;

  return function schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = async () => {
      const wait = lastStart + minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastStart = Date.now();
      return task();
    };
    const result = queue.then(run, run);
    // A failed task must not block the ones queued after it.
    queue = result.catch(() => undefined);
    return result;
  };
}
