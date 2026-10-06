import type { LatLng } from "@/types/parsed";

// Spherical geometry helpers. All distances are great-circle distances on a
// sphere of mean Earth radius; good enough for choosing seed points.

export const EARTH_RADIUS_KM = 6371.0088;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export type Vec3 = [number, number, number];

export function toVector({ lat, lng }: LatLng): Vec3 {
  const phi = toRad(lat);
  const lambda = toRad(lng);
  return [Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi)];
}

export function fromVector([x, y, z]: Vec3): LatLng {
  const norm = Math.hypot(x, y, z);
  return {
    lat: toDeg(Math.asin(Math.max(-1, Math.min(1, z / norm)))),
    lng: toDeg(Math.atan2(y, x)),
  };
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const dPhi = toRad(b.lat - a.lat);
  const dLambda = toRad(b.lng - a.lng);
  const h =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLambda / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Average of 3D unit vectors, projected back onto the sphere. Unlike a raw
// lat/lng average this is correct across the antimeridian and at high
// latitudes. Returns null for antipodal inputs where the average is ~0.
export function sphericalCentroid(points: LatLng[]): LatLng | null {
  if (points.length === 0) return null;
  const sum: Vec3 = [0, 0, 0];
  for (const p of points) {
    const v = toVector(p);
    sum[0] += v[0];
    sum[1] += v[1];
    sum[2] += v[2];
  }
  if (Math.hypot(...sum) < 1e-9) return null;
  return fromVector(sum);
}

// Point a fraction `t` of the way along the great circle from a to b.
export function interpolateGreatCircle(a: LatLng, b: LatLng, t: number): LatLng {
  const va = toVector(a);
  const vb = toVector(b);
  const dot = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const omega = Math.acos(dot);
  if (omega < 1e-12) return { ...a };
  const s = Math.sin(omega);
  const wa = Math.sin((1 - t) * omega) / s;
  const wb = Math.sin(t * omega) / s;
  return fromVector([wa * va[0] + wb * vb[0], wa * va[1] + wb * vb[1], wa * va[2] + wb * vb[2]]);
}

// Initial bearing from a to b, in degrees clockwise from north.
export function bearingDeg(a: LatLng, b: LatLng): number {
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const dLambda = toRad(b.lng - a.lng);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Point reached by travelling `distanceKm` from `origin` on `bearing`.
export function destinationPoint(origin: LatLng, bearing: number, distanceKm: number): LatLng {
  const delta = distanceKm / EARTH_RADIUS_KM;
  const theta = toRad(bearing);
  const phi1 = toRad(origin.lat);
  const lambda1 = toRad(origin.lng);
  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta)
  );
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
    );
  return { lat: toDeg(phi2), lng: ((toDeg(lambda2) + 540) % 360) - 180 };
}
