import { haversineKm } from "@/lib/geo/geometry";
import type { Router } from "@/lib/geo/types";

// Mock Router: straight-line distance x a typical road-detour factor, at an
// average highway-ish speed plus a fixed start/stop allowance. Rough, but
// shaped like real OSRM output so the UI can be demoed offline.
const DETOUR_FACTOR = 1.25;
const AVG_SPEED_KMH = 85;
const OVERHEAD_SEC = 5 * 60;

export function createMockRouter(): Router {
  return {
    name: "mock-estimate",
    async travelMatrix(sources, destinations) {
      const distancesM = sources.map((s) => destinations.map((d) => haversineKm(s, d) * DETOUR_FACTOR * 1000));
      const durationsSec = distancesM.map((row) =>
        row.map((m) => Math.round((m / 1000 / AVG_SPEED_KMH) * 3600 + OVERHEAD_SEC))
      );
      return { durationsSec, distancesM: distancesM.map((row) => row.map(Math.round)) };
    },
  };
}
