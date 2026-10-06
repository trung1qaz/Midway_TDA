import type { Geocoder } from "@/lib/geo/types";
import type { LatLng } from "@/types/parsed";
import { generateSeeds } from "./seeds";
import { snapSeeds } from "./snap";

export { generateSeeds } from "./seeds";
export { dedupeCandidates, MAX_CANDIDATES } from "./snap";

// Seeds from member locations -> snapped, deduped settlements.
export async function generateCandidates(points: LatLng[], geocoder: Geocoder) {
  const seeds = generateSeeds(points);
  const { candidates, dropped } = await snapSeeds(seeds, geocoder);
  return { seeds, candidates, dropped };
}
