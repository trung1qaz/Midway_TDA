import {
  bearingDeg,
  destinationPoint,
  fromVector,
  haversineKm,
  interpolateGreatCircle,
  sphericalCentroid,
  toVector,
  type Vec3,
} from "@/lib/geo/geometry";
import type { Seed } from "@/types/candidates";
import type { LatLng } from "@/types/parsed";

// Pure seed-point generation. Kept to about 7 seeds because each one costs
// up to two reverse-geocode calls at 1 request/second.

// Everyone within this radius of the centroid counts as "the same place".
export const SAME_PLACE_KM = 2;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const normalize = (v: Vec3): Vec3 => {
  const n = norm(v);
  return [v[0] / n, v[1] / n, v[2] / n];
};

// Geometric median via Weiszfeld's algorithm on 3D unit vectors, re-projected
// onto the sphere after each step. Chord distance is monotonic in
// great-circle distance, so this closely approximates the point minimizing
// total travel distance for regional groups.
export function geometricMedian(points: LatLng[], maxIter = 500, tol = 1e-12): LatLng | null {
  if (points.length === 0) return null;
  if (points.length === 1) return { ...points[0] };
  const xs = points.map(toVector);
  const start = sphericalCentroid(points) ?? points[0];
  let y = toVector(start);

  for (let iter = 0; iter < maxIter; iter++) {
    const num: Vec3 = [0, 0, 0];
    let den = 0;
    let coincident = -1;
    for (let i = 0; i < xs.length; i++) {
      const d = norm(sub(xs[i], y));
      if (d < 1e-12) {
        coincident = i;
        continue;
      }
      num[0] += xs[i][0] / d;
      num[1] += xs[i][1] / d;
      num[2] += xs[i][2] / d;
      den += 1 / d;
    }
    if (coincident >= 0) {
      // Weiszfeld is undefined at a data point. That point is the median iff
      // the pull of all other points (sum of unit vectors toward them) is <= 1.
      const pull: Vec3 = [0, 0, 0];
      for (let i = 0; i < xs.length; i++) {
        if (i === coincident) continue;
        const dir = sub(xs[i], y);
        const d = norm(dir);
        pull[0] += dir[0] / d;
        pull[1] += dir[1] / d;
        pull[2] += dir[2] / d;
      }
      if (norm(pull) <= 1) return fromVector(y);
      // Otherwise step off the point in the direction of the pull.
      y = normalize([y[0] + pull[0] * 1e-6, y[1] + pull[1] * 1e-6, y[2] + pull[2] * 1e-6]);
      continue;
    }
    const next = normalize([num[0] / den, num[1] / den, num[2] / den]);
    const moved = norm(sub(next, y));
    y = next;
    if (moved < tol) break;
  }
  return fromVector(y);
}

export function maxDistanceKm(p: LatLng, points: LatLng[]): number {
  let max = 0;
  for (const q of points) max = Math.max(max, haversineKm(p, q));
  return max;
}

// Minimax center: the point minimizing the farthest member's distance (the
// fairness-oriented seed). Coarse grid over the members' bounding box, then
// repeatedly zooms in around the best cell. Assumes the group doesn't span
// the antimeridian, which holds for this app's use.
export function minimaxCenter(points: LatLng[], gridSize = 11, rounds = 25): LatLng | null {
  if (points.length === 0) return null;
  if (points.length === 1) return { ...points[0] };

  let minLat = Math.min(...points.map((p) => p.lat));
  let maxLat = Math.max(...points.map((p) => p.lat));
  let minLng = Math.min(...points.map((p) => p.lng));
  let maxLng = Math.max(...points.map((p) => p.lng));
  const padLat = Math.max((maxLat - minLat) * 0.1, 0.01);
  const padLng = Math.max((maxLng - minLng) * 0.1, 0.01);
  minLat -= padLat;
  maxLat += padLat;
  minLng -= padLng;
  maxLng += padLng;

  let best: LatLng = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  let bestScore = maxDistanceKm(best, points);

  for (let round = 0; round < rounds; round++) {
    const stepLat = (maxLat - minLat) / (gridSize - 1);
    const stepLng = (maxLng - minLng) / (gridSize - 1);
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const p = { lat: minLat + i * stepLat, lng: minLng + j * stepLng };
        const score = maxDistanceKm(p, points);
        if (score < bestScore) {
          best = p;
          bestScore = score;
        }
      }
    }
    // Shrink the search window to two grid cells around the best point.
    minLat = best.lat - stepLat;
    maxLat = best.lat + stepLat;
    minLng = best.lng - stepLng;
    maxLng = best.lng + stepLng;
  }
  return best;
}

const RING_BEARINGS: [number, string][] = [
  [0, "north"],
  [90, "east"],
  [180, "south"],
  [270, "west"],
];

// Ring radius: 30% of the farthest member's distance from the centroid,
// kept within 3–150 km so tight groups still get distinct towns and
// spread-out groups don't get seeds far outside the group.
export function ringRadiusKm(centroid: LatLng, points: LatLng[]): number {
  return Math.min(150, Math.max(3, 0.3 * maxDistanceKm(centroid, points)));
}

export function generateSeeds(points: LatLng[]): Seed[] {
  if (points.length === 0) return [];
  if (points.length === 1) {
    return [{ point: { ...points[0] }, strategy: "single-member", label: "Only member's location" }];
  }

  const centroid = sphericalCentroid(points);
  // Antipodal groups have no meaningful centroid; fall back to the first member.
  if (!centroid) return [{ point: { ...points[0] }, strategy: "single-member", label: "First member's location" }];

  if (maxDistanceKm(centroid, points) <= SAME_PLACE_KM) {
    return [{ point: centroid, strategy: "same-place", label: "Everyone's shared location" }];
  }

  if (points.length === 2) {
    const [a, b] = points;
    const mid = interpolateGreatCircle(a, b, 0.5);
    const along = [0.4, 0.5, 0.6].map<Seed>((t) => ({
      point: interpolateGreatCircle(a, b, t),
      strategy: "great-circle",
      label: `Great-circle ${Math.round(t * 100)}%`,
    }));
    // Two side seeds give the snapper a chance to find towns off the line.
    const offsetKm = Math.max(3, 0.15 * haversineKm(a, b));
    const lineBearing = bearingDeg(mid, b);
    const sides = [90, -90].map<Seed>((turn) => ({
      point: destinationPoint(mid, (lineBearing + turn + 360) % 360, offsetKm),
      strategy: "perpendicular-offset",
      label: `Offset ${turn > 0 ? "right" : "left"} of midpoint`,
    }));
    return [...along, ...sides];
  }

  const seeds: Seed[] = [
    { point: centroid, strategy: "spherical-centroid", label: "Spherical centroid" },
  ];
  const median = geometricMedian(points);
  if (median) seeds.push({ point: median, strategy: "geometric-median", label: "Geometric median" });
  const minimax = minimaxCenter(points);
  if (minimax) seeds.push({ point: minimax, strategy: "minimax", label: "Minimax center" });

  const radius = ringRadiusKm(centroid, points);
  for (const [bearing, name] of RING_BEARINGS) {
    seeds.push({
      point: destinationPoint(centroid, bearing, radius),
      strategy: "ring",
      label: `Ring (${name}, ${Math.round(radius)} km)`,
    });
  }
  return seeds;
}
