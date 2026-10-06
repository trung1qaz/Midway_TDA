import { placeKey, type Geocoder, type Place } from "@/lib/geo/types";
import type { Candidate, Seed } from "@/types/candidates";

// Snaps geometric seeds onto real settlements so pins land on towns rather
// than lakes or fields, then dedupes them.

export const MAX_CANDIDATES = 7;
// Nominatim reverse zoom levels: 10 ≈ city, 13 ≈ village/suburb.
export const CITY_ZOOM = 10;
export const VILLAGE_ZOOM = 13;

export async function snapSeed(seed: Seed, geocoder: Geocoder): Promise<Place | null> {
  const city = await geocoder.reverseGeocode(seed.point, CITY_ZOOM);
  if (city?.isSettlement) return city;
  const village = await geocoder.reverseGeocode(seed.point, VILLAGE_ZOOM);
  return village?.isSettlement ? village : null;
}

export function toCandidate(seed: Seed, place: Place): Candidate {
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
  dropped: Seed[]; // seeds with no settlement nearby
}

export async function snapSeeds(seeds: Seed[], geocoder: Geocoder): Promise<SnapResult> {
  const snapped: Candidate[] = [];
  const dropped: Seed[] = [];
  let firstError: unknown = null;
  // Sequential: the geocoder is rate limited anyway.
  for (const seed of seeds) {
    try {
      const place = await snapSeed(seed, geocoder);
      if (place) snapped.push(toCandidate(seed, place));
      else dropped.push(seed);
    } catch (error) {
      firstError ??= error;
      dropped.push(seed);
    }
  }
  // One flaky lookup just loses a seed; if *every* lookup failed the
  // geocoder is down and the caller should report that, not "no towns".
  if (snapped.length === 0 && firstError) throw firstError;
  return { candidates: dedupeCandidates(snapped), dropped };
}
