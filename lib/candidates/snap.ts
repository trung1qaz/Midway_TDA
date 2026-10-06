import { haversineKm } from "@/lib/geo/geometry";
import { placeKey, type Geocoder, type Place, type SettlementFinder } from "@/lib/geo/types";
import type { Candidate, Seed } from "@/types/candidates";
import type { LatLng } from "@/types/parsed";

// Snaps geometric seeds onto real settlements so pins land on towns rather
// than lakes or fields, then dedupes them.
//
//   1. Reverse-geocode each seed at city zoom, then village zoom. This works
//      when the seed falls inside a town's boundary.
//   2. Seeds that still only hit an area (in the rural US usually a county)
//      get the nearest named city/town (or else village) within
//      NEARBY_RADIUS_KM, found with one SettlementFinder request for all of
//      them. If that service is down, those seeds are dropped.

export const MAX_CANDIDATES = 7;
// Nominatim reverse zoom levels: 10 ≈ city, 13 ≈ village/suburb.
export const CITY_ZOOM = 10;
export const VILLAGE_ZOOM = 13;
export const NEARBY_RADIUS_KM = 30;

interface ReverseOutcome {
  place: Place | null;
  // What reverse found instead (e.g. "Huntington County, Indiana, ..."),
  // used as regional context for a nearby-search match.
  context: string | null;
}

export async function snapSeedByReverse(seed: Seed, geocoder: Geocoder): Promise<ReverseOutcome> {
  const city = await geocoder.reverseGeocode(seed.point, CITY_ZOOM);
  if (city?.isSettlement) return { place: city, context: null };
  const village = await geocoder.reverseGeocode(seed.point, VILLAGE_ZOOM);
  if (village?.isSettlement) return { place: village, context: null };
  return { place: null, context: city?.displayName ?? village?.displayName ?? null };
}

const BIG = new Set(["city", "town"]);

// Nearest city/town within the radius, else nearest village, else null.
export function pickNearestSettlement(point: LatLng, places: Place[], radiusKm = NEARBY_RADIUS_KM): Place | null {
  const withDistance = places
    .map((p) => ({ p, km: haversineKm(point, p.point) }))
    .filter((x) => x.km <= radiusKm)
    .sort((a, b) => a.km - b.km);
  return (withDistance.find((x) => BIG.has(x.p.placeType)) ?? withDistance[0])?.p ?? null;
}

export function toCandidate(seed: Seed, place: Place, snappedBy: Candidate["snappedBy"]): Candidate {
  return {
    id: placeKey(place),
    name: place.name,
    displayName: place.displayName,
    point: place.point,
    osmType: place.osmType,
    osmId: place.osmId,
    placeType: place.placeType,
    strategy: seed.strategy,
    seedLabel: seed.label,
    seedPoint: seed.point,
    snappedBy,
    alsoFoundBy: [],
  };
}

// Keeps the first candidate per OSM object (seed order = generation order)
// and records which later seeds landed on the same place.
export function dedupeCandidates(candidates: Candidate[], max = MAX_CANDIDATES): Candidate[] {
  const byId = new Map<string, Candidate>();
  for (const c of candidates) {
    const existing = byId.get(c.id);
    if (existing) {
      existing.alsoFoundBy.push(c.seedLabel);
    } else if (byId.size < max) {
      byId.set(c.id, { ...c, alsoFoundBy: [...c.alsoFoundBy] });
    }
  }
  return [...byId.values()];
}

export interface SnapResult {
  candidates: Candidate[];
  dropped: Seed[]; // seeds with no settlement nearby (or lookup failed)
  notes: string[];
}

export async function snapSeeds(
  seeds: Seed[],
  geocoder: Geocoder,
  finder?: SettlementFinder
): Promise<SnapResult> {
  const notes: string[] = [];
  // Index-aligned with seeds so generation order survives both phases.
  const snapped: (Candidate | null)[] = seeds.map(() => null);
  const missed: { index: number; context: string | null }[] = [];
  let reverseErrors = 0;
  let firstError: unknown = null;

  // Phase 1, sequential: the geocoder is rate limited anyway.
  for (const [index, seed] of seeds.entries()) {
    try {
      const { place, context } = await snapSeedByReverse(seed, geocoder);
      if (place) snapped[index] = toCandidate(seed, place, "reverse-geocode");
      else missed.push({ index, context });
    } catch (error) {
      reverseErrors++;
      firstError ??= error;
      missed.push({ index, context: null });
    }
  }
  // Every lookup failing means the geocoder is down; report that rather
  // than "no towns found".
  if (seeds.length > 0 && reverseErrors === seeds.length) throw firstError;

  // Phase 2: one nearby-settlement query for every seed that missed.
  if (missed.length > 0 && finder) {
    try {
      const nearby = await finder.nearbySettlements(
        missed.map((m) => seeds[m.index].point),
        NEARBY_RADIUS_KM
      );
      for (const { index, context } of missed) {
        const place = pickNearestSettlement(seeds[index].point, nearby);
        if (!place) continue;
        const displayName = context ? `${place.name} (near ${context})` : place.displayName;
        snapped[index] = toCandidate(seeds[index], { ...place, displayName }, "nearest-settlement");
      }
    } catch (error) {
      console.error("[candidates] nearby-town search failed:", error instanceof Error ? error.message : error);
      notes.push(
        `The nearby-town search (${finder.name}) didn't respond, so ${missed.length} seed point${
          missed.length === 1 ? "" : "s"
        } outside town limits couldn't be used.`
      );
    }
  }

  const dropped = seeds.filter((_, i) => !snapped[i]);
  const candidates = dedupeCandidates(snapped.filter((c): c is Candidate => c !== null));
  return { candidates, dropped, notes };
}
