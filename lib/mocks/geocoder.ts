import { haversineKm } from "@/lib/geo/geometry";
import type { Geocoder, Place } from "@/lib/geo/types";
import { MOCK_PLACES, STATE_NAMES, type MockPlace } from "./gazetteer";

// Mock Geocoder backed by the fixture gazetteer. Forward search matches place
// names inside the query; reverse returns the nearest fixture settlement.
// Only places in gazetteer.ts can be found in mock mode.

// Small on purpose: like real Nominatim, a reverse lookup only "hits" a town
// when the point is basically inside it; everything else goes through the
// nearby-settlement fallback (lib/mocks/settlements.ts).
const REVERSE_RADIUS_KM = 6;

export function toPlace(p: MockPlace, index: number): Place {
  const stateName = STATE_NAMES[p.state] ?? p.state;
  const displayName =
    p.type === "state"
      ? `${stateName}, United States`
      : p.type === "address"
        ? `${p.name}, Chicago, ${stateName}, United States`
        : `${p.name}, ${stateName}, United States`;
  return {
    point: { lat: p.lat, lng: p.lng },
    name: p.name,
    displayName,
    osmType: "mock",
    osmId: 900_000 + index,
    isSettlement: p.type === "city" || p.type === "town" || p.type === "village",
    placeType: p.type,
  };
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function mentions(query: string, phrase: string): boolean {
  return new RegExp(`\\b${escapeRegex(phrase)}\\b`, "i").test(query);
}

export function mockForwardLookup(query: string): Place | null {
  const q = query.toLowerCase().replace(/[.,]/g, " ");
  const matches = MOCK_PLACES.map((p, index) => ({ p, index }))
    .filter(({ p }) => [p.name.toLowerCase(), ...(p.aliases ?? [])].some((phrase) => mentions(q, phrase)))
    .map(({ p, index }) => ({
      p,
      index,
      // Prefer specific places over states, and places whose state is named too.
      score:
        (p.type === "state" ? 0 : 100) +
        (mentions(q, p.state.toLowerCase()) || mentions(q, (STATE_NAMES[p.state] ?? "").toLowerCase()) ? 10 : 0) +
        (p.type === "address" ? 50 : 0) +
        p.name.length / 100,
    }))
    .sort((a, b) => b.score - a.score);
  return matches.length > 0 ? toPlace(matches[0].p, matches[0].index) : null;
}

export function createMockGeocoder(): Geocoder {
  return {
    name: "mock-gazetteer",
    async geocode(query) {
      return mockForwardLookup(query);
    },
    async reverseGeocode(point, zoom) {
      // Mirrors Nominatim's behaviour loosely: city-level zoom only finds
      // cities and towns; village-level zoom also finds villages.
      const allowed = zoom >= 13 ? ["city", "town", "village"] : ["city", "town"];
      let best: { place: MockPlace; index: number; km: number } | null = null;
      MOCK_PLACES.forEach((place, index) => {
        if (!allowed.includes(place.type)) return;
        const km = haversineKm(point, place);
        if (km <= REVERSE_RADIUS_KM && (!best || km < best.km)) best = { place, index, km };
      });
      const found = best as { place: MockPlace; index: number } | null;
      return found ? toPlace(found.place, found.index) : null;
    },
  };
}
