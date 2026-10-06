import { describe, expect, it } from "vitest";
import { buildOverpassQuery, OverpassError, parseOverpassResponse } from "@/lib/geo/overpass";

describe("buildOverpassQuery", () => {
  it("unions one around-filter per point for named city/town/village nodes", () => {
    const q = buildOverpassQuery(
      [
        { lat: 40.95, lng: -85.6 },
        { lat: 41.3, lng: -86 },
      ],
      30
    );
    expect(q).toBe(
      '[out:json][timeout:25];(' +
        'node[place~"^(city|town|village)$"][name](around:30000,40.95000,-85.60000);' +
        'node[place~"^(city|town|village)$"][name](around:30000,41.30000,-86.00000);' +
        ");out body;"
    );
  });
});

describe("parseOverpassResponse", () => {
  it("keeps named place nodes as settlements with node ids", () => {
    const places = parseOverpassResponse({
      elements: [
        { type: "node", id: 153361408, lat: 41.41, lon: -85.85, tags: { place: "village", name: "Milford" } },
        { type: "node", id: 2, lat: 41, lon: -85, tags: { place: "town" } }, // unnamed
        { type: "way", id: 3, tags: { place: "town", name: "Way" } },
      ],
    });
    expect(places).toEqual([
      {
        point: { lat: 41.41, lng: -85.85 },
        name: "Milford",
        displayName: "Milford",
        osmType: "node",
        osmId: 153361408,
        isSettlement: true,
        placeType: "village",
      },
    ]);
  });

  it("throws on unreadable responses", () => {
    expect(() => parseOverpassResponse({ remark: "runtime error" })).toThrow(OverpassError);
  });
});
