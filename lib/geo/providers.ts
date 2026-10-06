import { serverConfig } from "@/lib/config";
import { createThrottle, type Throttle } from "@/lib/http/throttle";
import { createNominatimGeocoder } from "./nominatim";
import type { Geocoder } from "./types";

// The one place that decides which provider implementation callers get.
// Throttles are process-wide singletons (stored on globalThis so dev-mode hot
// reloads don't create a second queue and break the 1 req/s limit).

const ONE_REQUEST_PER_SECOND = 1000;

type ProviderState = { throttles: Map<string, Throttle>; geocoder?: Geocoder };

const state: ProviderState = ((globalThis as { __midwayProviders?: ProviderState })
  .__midwayProviders ??= { throttles: new Map() });

export function sharedThrottle(service: string): Throttle {
  let throttle = state.throttles.get(service);
  if (!throttle) {
    throttle = createThrottle(ONE_REQUEST_PER_SECOND);
    state.throttles.set(service, throttle);
  }
  return throttle;
}

export function getGeocoder(): Geocoder {
  if (!state.geocoder) {
    const config = serverConfig();
    state.geocoder = createNominatimGeocoder({
      baseUrl: config.nominatimBaseUrl,
      userAgent: config.userAgent,
      throttle: sharedThrottle("nominatim"),
    });
  }
  return state.geocoder;
}
