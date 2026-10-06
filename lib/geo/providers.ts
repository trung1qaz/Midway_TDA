import { serverConfig } from "@/lib/config";
import { createCache, type AsyncCache } from "@/lib/http/cache";
import { createThrottle, type Throttle } from "@/lib/http/throttle";
import { createMockGeocoder } from "@/lib/mocks/geocoder";
import { createMockRouter } from "@/lib/mocks/router";
import { createNominatimGeocoder } from "./nominatim";
import { createOsrmRouter } from "./osrm";
import type { Geocoder, Router } from "./types";

// The one place that decides which provider implementation callers get.
// Throttles and caches are process-wide singletons, stored on globalThis so
// dev-mode hot reloads don't create a second queue (which would break the
// 1 req/s limit) or drop the cache. Providers themselves are cheap and are
// built per call, so env changes apply without a restart.

const ONE_REQUEST_PER_SECOND = 1000;

type SharedState = {
  throttles: Map<string, Throttle>;
  caches: Map<string, AsyncCache<unknown>>;
};

const shared: SharedState = ((globalThis as { __midwayProviders?: SharedState })
  .__midwayProviders ??= { throttles: new Map(), caches: new Map() });

function sharedThrottle(service: string): Throttle {
  let throttle = shared.throttles.get(service);
  if (!throttle) {
    throttle = createThrottle(ONE_REQUEST_PER_SECOND);
    shared.throttles.set(service, throttle);
  }
  return throttle;
}

function sharedCache(service: string, ttlMs: number, maxEntries: number): AsyncCache<unknown> {
  let cache = shared.caches.get(service);
  if (!cache) {
    cache = createCache<unknown>({ ttlMs, maxEntries });
    shared.caches.set(service, cache);
  }
  return cache;
}

const HOUR = 60 * 60 * 1000;

// MIDWAY_USE_MOCKS=true swaps in fixture providers (lib/mocks) so the whole
// flow works offline with no API key.
export function getGeocoder(): Geocoder {
  const config = serverConfig();
  if (config.useMocks) return createMockGeocoder();
  return createNominatimGeocoder({
    baseUrl: config.nominatimBaseUrl,
    userAgent: config.userAgent,
    throttle: sharedThrottle("nominatim"),
    cache: sharedCache("nominatim", 24 * HOUR, 2000),
  });
}

export function getRouter(): Router {
  const config = serverConfig();
  if (config.useMocks) return createMockRouter();
  return createOsrmRouter({
    baseUrl: config.osrmBaseUrl,
    userAgent: config.userAgent,
    throttle: sharedThrottle("osrm"),
    cache: sharedCache("osrm", HOUR, 200),
  });
}
