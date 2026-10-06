import type { LatLng } from "./parsed";

// How a seed point was produced. Shown in the UI so the approach can be
// explained; it is *not* a ranking.
export type SeedStrategy =
  | "single-member" // only one member: their own location
  | "same-place" // everyone is at (nearly) the same spot
  | "great-circle" // 2 members: fractions along the line between them
  | "perpendicular-offset" // 2 members: either side of the midpoint, for variety
  | "spherical-centroid" // average of 3D unit vectors
  | "geometric-median" // minimizes total distance (Weiszfeld)
  | "minimax" // minimizes the farthest member's distance (fairness seed)
  | "ring"; // points around the centroid, scaled to the group's spread

export interface Seed {
  point: LatLng;
  strategy: SeedStrategy;
  label: string; // e.g. "Great-circle 40%", "Ring (north)"
}

export interface Candidate {
  id: string; // `${osmType}/${osmId}`
  name: string;
  displayName: string;
  point: LatLng; // the settlement's own coordinates, not the seed's
  osmType: string;
  osmId: number;
  placeType: string; // city | town | village
  strategy: SeedStrategy;
  seedLabel: string;
  seedPoint: LatLng;
  // Labels of later seeds that snapped to the same place.
  alsoFoundBy: string[];
}
