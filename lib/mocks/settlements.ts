import { haversineKm } from "@/lib/geo/geometry";
import type { SettlementFinder } from "@/lib/geo/types";
import { MOCK_PLACES } from "./gazetteer";
import { toPlace } from "./geocoder";

// Mock SettlementFinder: fixture settlements within the radius of any point.
export function createMockSettlementFinder(): SettlementFinder {
  return {
    name: "mock-gazetteer",
    async nearbySettlements(points, radiusKm) {
      return MOCK_PLACES.flatMap((p, index) =>
        (p.type === "city" || p.type === "town" || p.type === "village") &&
        points.some((q) => haversineKm(q, p) <= radiusKm)
          ? [toPlace(p, index)]
          : []
      );
    },
  };
}
