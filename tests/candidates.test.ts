import { describe, expect, it } from "vitest";
import { dedupeCandidates, pickNearestSettlement, snapSeeds } from "@/lib/candidates/snap";
import {
  generateSeeds,
  geometricMedian,
  maxDistanceKm,
  minimaxCenter,
} from "@/lib/candidates/seeds";
import { haversineKm, interpolateGreatCircle, sphericalCentroid } from "@/lib/geo/geometry";
import type { Geocoder, Place, SettlementFinder } from "@/lib/geo/types";
import type { Candidate } from "@/types/candidates";
import type { LatLng } from "@/types/parsed";

const CHICAGO = { lat: 41.8781, lng: -87.6298 };
const INDY = { lat: 39.7684, lng: -86.1581 };
const COLUMBUS = { lat: 39.9612, lng: -82.9988 };
const CHAMPAIGN = { lat: 40.1164, lng: -88.2434 };

const close = (a: LatLng, b: LatLng, km = 1) => expect(haversineKm(a, b)).toBeLessThan(km);

describe("sphericalCentroid", () => {
  it("returns the point itself for one point", () => {
    close(sphericalCentroid([CHICAGO])!, CHICAGO, 0.001);
  });

  it("is the great-circle midpoint for two points", () => {
    const c = sphericalCentroid([CHICAGO, COLUMBUS])!;
    expect(haversineKm(c, CHICAGO)).toBeCloseTo(haversineKm(c, COLUMBUS), 3);
    close(c, interpolateGreatCircle(CHICAGO, COLUMBUS, 0.5), 0.01);
  });

  it("averages unit vectors, not raw lat/lng, across the antimeridian", () => {
    const c = sphericalCentroid([
      { lat: 0, lng: 179 },
      { lat: 0, lng: -179 },
    ])!;
    expect(Math.abs(c.lng)).toBeCloseTo(180, 5); // raw average would give 0
    expect(c.lat).toBeCloseTo(0, 6);
  });

  it("returns null for antipodal points and empty input", () => {
    expect(sphericalCentroid([{ lat: 0, lng: 0 }, { lat: 0, lng: 180 }])).toBeNull();
    expect(sphericalCentroid([])).toBeNull();
  });
});

describe("geometricMedian", () => {
  it("is the middle point of three points on a line", () => {
    const a = { lat: 40, lng: -90 };
    const b = { lat: 40, lng: -88 };
    const mid = interpolateGreatCircle(a, b, 0.5);
    close(geometricMedian([a, mid, b])!, mid, 0.5);
  });

  it("is not pulled toward an outlier the way the centroid is", () => {
    const cluster = [CHICAGO, { lat: 41.9, lng: -87.7 }, { lat: 41.85, lng: -87.6 }];
    const points = [...cluster, COLUMBUS];
    const median = geometricMedian(points)!;
    const centroid = sphericalCentroid(points)!;
    expect(haversineKm(median, CHICAGO)).toBeLessThan(haversineKm(centroid, CHICAGO));
    expect(haversineKm(median, CHICAGO)).toBeLessThan(20);
  });

  it("minimizes total distance better than the centroid", () => {
    const points = [CHICAGO, INDY, COLUMBUS, CHAMPAIGN];
    const total = (p: LatLng) => points.reduce((s, q) => s + haversineKm(p, q), 0);
    expect(total(geometricMedian(points)!)).toBeLessThanOrEqual(total(sphericalCentroid(points)!) + 1e-6);
  });
});

describe("minimaxCenter", () => {
  it("is the midpoint for two points", () => {
    close(minimaxCenter([CHICAGO, COLUMBUS])!, interpolateGreatCircle(CHICAGO, COLUMBUS, 0.5), 2);
  });

  it("equalizes the farthest distances for a cluster plus an outlier", () => {
    const points = [CHICAGO, { lat: 41.9, lng: -87.7 }, COLUMBUS];
    const center = minimaxCenter(points)!;
    // Optimal radius is half the farthest pair's distance.
    const half = haversineKm({ lat: 41.9, lng: -87.7 }, COLUMBUS) / 2;
    expect(maxDistanceKm(center, points)).toBeLessThan(half + 2);
  });

  it("beats the centroid and median on the farthest member's distance", () => {
    const points = [CHICAGO, { lat: 41.9, lng: -87.7 }, { lat: 41.85, lng: -87.6 }, COLUMBUS];
    const m = maxDistanceKm(minimaxCenter(points)!, points);
    expect(m).toBeLessThanOrEqual(maxDistanceKm(sphericalCentroid(points)!, points));
    expect(m).toBeLessThanOrEqual(maxDistanceKm(geometricMedian(points)!, points));
  });
});

describe("minimaxCenter (obtuse triangle)", () => {
  it("is the midpoint of the farthest pair when the third point is inside that circle", () => {
    const a = { lat: 40, lng: -90 };
    const b = { lat: 40, lng: -86 };
    const c = { lat: 40.3, lng: -88 };
    close(minimaxCenter([a, b, c])!, interpolateGreatCircle(a, b, 0.5), 0.5);
  });
});

describe("generateSeeds", () => {
  it("returns nothing for no members", () => {
    expect(generateSeeds([])).toEqual([]);
  });

  it("uses the member's own location for one member", () => {
    const seeds = generateSeeds([CHICAGO]);
    expect(seeds).toHaveLength(1);
    expect(seeds[0].strategy).toBe("single-member");
    close(seeds[0].point, CHICAGO, 0.001);
  });

  it("returns one seed when everyone is in the same place", () => {
    const seeds = generateSeeds([CHICAGO, { lat: 41.879, lng: -87.631 }, CHICAGO]);
    expect(seeds).toHaveLength(1);
    expect(seeds[0].strategy).toBe("same-place");
  });

  it("puts two-member seeds at 40/50/60% along the great circle plus side offsets", () => {
    const seeds = generateSeeds([CHICAGO, COLUMBUS]);
    const along = seeds.filter((s) => s.strategy === "great-circle");
    expect(along.map((s) => s.label)).toEqual(["Great-circle 40%", "Great-circle 50%", "Great-circle 60%"]);
    const d = haversineKm(CHICAGO, COLUMBUS);
    expect(haversineKm(CHICAGO, along[0].point) / d).toBeCloseTo(0.4, 3);
    expect(haversineKm(CHICAGO, along[2].point) / d).toBeCloseTo(0.6, 3);
    expect(seeds.filter((s) => s.strategy === "perpendicular-offset")).toHaveLength(2);
  });

  it("produces 7 seeds for 3+ members with every strategy labelled", () => {
    const seeds = generateSeeds([CHICAGO, INDY, COLUMBUS, CHAMPAIGN]);
    expect(seeds).toHaveLength(7);
    expect(seeds.map((s) => s.strategy)).toEqual([
      "spherical-centroid",
      "geometric-median",
      "minimax",
      "ring",
      "ring",
      "ring",
      "ring",
    ]);
  });
});

function place(id: number, name: string, point: LatLng, isSettlement = true, placeType = "town"): Place {
  return { point, name, displayName: name, osmType: "relation", osmId: id, isSettlement, placeType };
}

function candidate(id: string, label: string): Candidate {
  return {
    id,
    name: id,
    displayName: id,
    point: CHICAGO,
    osmType: "relation",
    osmId: 1,
    placeType: "town",
    strategy: "ring",
    seedLabel: label,
    seedPoint: CHICAGO,
    snappedBy: "reverse-geocode",
    alsoFoundBy: [],
  };
}

describe("pickNearestSettlement", () => {
  const seed = { lat: 40, lng: -86 };
  const village = { ...place(1, "Village", { lat: 40.05, lng: -86 }), placeType: "village" };
  const town = { ...place(2, "Town", { lat: 40.15, lng: -86 }), placeType: "town" };
  const farCity = { ...place(3, "City", { lat: 41, lng: -86 }), placeType: "city" };

  it("prefers the nearest city or town within the radius over a closer village", () => {
    expect(pickNearestSettlement(seed, [village, town, farCity], 30)?.name).toBe("Town");
  });

  it("uses a village when no city or town is in range, and null when nothing is", () => {
    expect(pickNearestSettlement(seed, [village, farCity], 30)?.name).toBe("Village");
    expect(pickNearestSettlement(seed, [farCity], 30)).toBeNull();
  });
});

describe("dedupeCandidates", () => {
  it("keeps the first occurrence per OSM id and records the merged seeds", () => {
    const out = dedupeCandidates([
      candidate("relation/1", "Centroid"),
      candidate("relation/2", "Median"),
      candidate("relation/1", "Minimax"),
      candidate("relation/1", "Ring (north)"),
    ]);
    expect(out.map((c) => c.id)).toEqual(["relation/1", "relation/2"]);
    expect(out[0].seedLabel).toBe("Centroid");
    expect(out[0].alsoFoundBy).toEqual(["Minimax", "Ring (north)"]);
  });

  it("caps the number of candidates", () => {
    const many = Array.from({ length: 10 }, (_, i) => candidate(`node/${i}`, `S${i}`));
    expect(dedupeCandidates(many, 7)).toHaveLength(7);
  });

  it("does not mutate its input", () => {
    const input = [candidate("relation/1", "A"), candidate("relation/1", "B")];
    dedupeCandidates(input);
    expect(input[0].alsoFoundBy).toEqual([]);
  });
});

describe("snapSeeds", () => {
  it("retries at village zoom, uses the place's own coordinates, and drops non-settlements", async () => {
    const town = { lat: 40.5, lng: -86.0 };
    const calls: number[] = [];
    const geocoder: Geocoder = {
      name: "fake",
      geocode: async () => null,
      async reverseGeocode(point, zoom) {
        calls.push(zoom);
        if (point.lat === 1) return zoom === 10 ? place(9, "County", point, false) : place(7, "Village", town);
        return place(8, "Lake", point, false);
      },
    };
    const { candidates, dropped } = await snapSeeds(
      [
        { point: { lat: 1, lng: 1 }, strategy: "spherical-centroid", label: "Centroid" },
        { point: { lat: 2, lng: 2 }, strategy: "ring", label: "Ring" },
      ],
      geocoder
    );
    expect(calls).toEqual([10, 13, 10, 13]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].point).toEqual(town);
    expect(candidates[0].id).toBe("relation/7");
    expect(dropped.map((s) => s.label)).toEqual(["Ring"]);
  });

  it("falls back to the nearest settlement for seeds outside town limits, in one finder call", async () => {
    const county = place(1, "Huntington County", CHICAGO, false, "county");
    const geocoder: Geocoder = { name: "fake", geocode: async () => null, reverseGeocode: async () => county };
    const finderCalls: LatLng[][] = [];
    const finder: SettlementFinder = {
      name: "fake-finder",
      async nearbySettlements(points) {
        finderCalls.push(points);
        return [
          { ...place(5, "Roanoke", { lat: 41.0, lng: -85.37 }), osmType: "node", placeType: "village" },
          { ...place(6, "Huntington", { lat: 40.88, lng: -85.5 }), osmType: "node", placeType: "town" },
        ];
      },
    };
    const { candidates, dropped } = await snapSeeds(
      [
        { point: { lat: 40.95, lng: -85.45 }, strategy: "minimax", label: "Minimax" },
        { point: { lat: 45, lng: -80 }, strategy: "ring", label: "Far ring" },
      ],
      geocoder,
      finder
    );
    expect(finderCalls).toHaveLength(1);
    expect(finderCalls[0]).toHaveLength(2);
    // Town beats a slightly closer village; the far seed has nothing in range.
    expect(candidates.map((c) => c.name)).toEqual(["Huntington"]);
    expect(candidates[0].snappedBy).toBe("nearest-settlement");
    expect(candidates[0].displayName).toBe("Huntington (near Huntington County)");
    expect(dropped.map((s) => s.label)).toEqual(["Far ring"]);
  });

  it("drops missed seeds with a note when the finder fails", async () => {
    const geocoder: Geocoder = { name: "fake", geocode: async () => null, reverseGeocode: async () => null };
    const finder: SettlementFinder = {
      name: "overpass",
      nearbySettlements: async () => {
        throw new Error("busy");
      },
    };
    const result = await snapSeeds([{ point: CHICAGO, strategy: "ring", label: "Ring" }], geocoder, finder);
    expect(result.candidates).toEqual([]);
    expect(result.notes[0]).toMatch(/overpass/);
  });

  it("throws when every lookup fails so the route can report an outage", async () => {
    const geocoder: Geocoder = {
      name: "down",
      geocode: async () => null,
      reverseGeocode: async () => {
        throw new Error("503");
      },
    };
    await expect(
      snapSeeds([{ point: CHICAGO, strategy: "ring", label: "Ring" }], geocoder)
    ).rejects.toThrow("503");
  });
});
