import type { Geocoder, SettlementFinder } from "@/lib/geo/types";
import type { LatLng } from "@/types/parsed";
import { generateSeeds } from "./seeds";
import { snapSeeds } from "./snap";

export { generateSeeds } from "./seeds";
export { dedupeCandidates, MAX_CANDIDATES } from "./snap";

// Seeds from member locations -> snapped, deduped settlements.
export async function generateCandidates(points: LatLng[], geocoder: Geocoder, finder?: SettlementFinder) {
  const seeds = generateSeeds(points);
  const { candidates, dropped, notes } = await snapSeeds(seeds, geocoder, finder);
  return { seeds, candidates, dropped, notes };
}
