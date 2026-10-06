import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCache } from "@/lib/http/cache";
import { createThrottle } from "@/lib/http/throttle";
import {
  buildReverseUrl,
  buildSearchUrl,
  createNominatimGeocoder,
  isSettlementResult,
  parseReverseResponse,
  parseSearchResponse,
} from "@/lib/geo/nominatim";

const BASE = "https://nominatim.example.org";

const champaign = {
  place_id: 123, // unstable; must not be used as the id
  osm_type: "relation",
  osm_id: 126114,
  lat: "40.1164",
  lon: "-88.2434",
  category: "boundary",
  type: "administrative",
  addresstype: "city",
  name: "Champaign",
  display_name: "Champaign, Champaign County, Illinois, United States",
};

describe("URL building", () => {
  it("builds jsonv2 forward and reverse URLs", () => {
    expect(buildSearchUrl(BASE, "Fort Wayne, IN")).toBe(
      `${BASE}/search?format=jsonv2&limit=1&q=Fort+Wayne%2C+IN`
    );
    expect(buildReverseUrl(BASE, { lat: 40.123456789, lng: -86.1 }, 10)).toBe(
      `${BASE}/reverse?format=jsonv2&lat=40.12346&lon=-86.10000&zoom=10`
    );
  });
});

describe("response filtering", () => {
  it("treats city, town and village results as settlements", () => {
    for (const addresstype of ["city", "town", "village"]) {
      expect(isSettlementResult({ addresstype })).toBe(true);
    }
    expect(isSettlementResult({ category: "place", type: "town" })).toBe(true);
  });

  it("rejects non-settlement results", () => {
    for (const addresstype of ["county", "state", "hamlet", "suburb", "water", "road"]) {
      expect(isSettlementResult({ addresstype })).toBe(false);
    }
    expect(isSettlementResult({ category: "natural", type: "water" })).toBe(false);
    expect(isSettlementResult({ category: "boundary", type: "administrative" })).toBe(false);
  });

  it("parses a search result using osm_type/osm_id and numeric coordinates", () => {
    const place = parseSearchResponse([champaign])!;
    expect(place).toMatchObject({
      point: { lat: 40.1164, lng: -88.2434 },
      name: "Champaign",
      osmType: "relation",
      osmId: 126114,
      isSettlement: true,
      placeType: "city",
    });
    expect(parseSearchResponse([])).toBeNull();
  });

  it("returns null for reverse errors and unusable results", () => {
    expect(parseReverseResponse({ error: "Unable to geocode" })).toBeNull();
    expect(parseReverseResponse({ ...champaign, lat: "not a number" })).toBeNull();
    expect(parseReverseResponse({ ...champaign, addresstype: "county" })!.isSettlement).toBe(false);
  });

  it("falls back to the display name when name is missing", () => {
    expect(parseSearchResponse([{ ...champaign, name: "" }])!.name).toBe("Champaign");
  });
});

describe("throttle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("spaces task starts at least 1 s apart and runs them in order", async () => {
    const throttle = createThrottle(1000);
    const starts: number[] = [];
    const tasks = [1, 2, 3].map((n) =>
      throttle(async () => {
        starts.push(Date.now());
        return n;
      })
    );
    await vi.runAllTimersAsync();
    expect(await Promise.all(tasks)).toEqual([1, 2, 3]);
    expect(starts).toHaveLength(3);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1000);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(1000);
  });

  it("doesn't wait when the previous call was long enough ago", async () => {
    const throttle = createThrottle(1000);
    await throttle(async () => undefined);
    vi.advanceTimersByTime(5000);
    const before = Date.now();
    let started = 0;
    const p = throttle(async () => {
      started = Date.now();
    });
    await vi.advanceTimersByTimeAsync(0);
    await p;
    expect(started).toBe(before);
  });

  it("keeps going after a task fails", async () => {
    const throttle = createThrottle(1000);
    const failed = throttle(async () => {
      throw new Error("boom");
    });
    const next = throttle(async () => "ok");
    await vi.runAllTimersAsync();
    await expect(failed).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ok");
  });

  it("is applied to geocoder calls, and cached lookups skip the network", async () => {
    const fetchImpl = vi.fn(async () => Response.json([champaign])) as unknown as typeof fetch;
    const geocoder = createNominatimGeocoder({
      baseUrl: BASE,
      userAgent: "Midway-Test/1.0 (contact: test@example.com)",
      throttle: createThrottle(1000),
      cache: createCache({ ttlMs: 60_000, maxEntries: 10 }),
      fetchImpl,
    });
    const times: number[] = [];
    (fetchImpl as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      times.push(Date.now());
      return Response.json([champaign]);
    });

    const results = Promise.all([
      geocoder.geocode("Champaign, IL"),
      geocoder.geocode("Urbana, IL"),
      geocoder.geocode("Champaign, IL"), // cache hit, shares the in-flight request
    ]);
    await vi.runAllTimersAsync();
    const [first, , third] = await results;
    expect(first).toEqual(third);
    expect(times).toHaveLength(2);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(1000);
    const init = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1];
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/^Midway-Test/);
  });
});
