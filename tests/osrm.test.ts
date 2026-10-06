import { describe, expect, it, vi } from "vitest";
import { buildTableUrl, createOsrmRouter, MAX_COORDINATES, OsrmError, parseTableResponse } from "@/lib/geo/osrm";
import type { Throttle } from "@/lib/http/throttle";

const BASE = "https://router.example.org";
const passthrough: Throttle = (task) => task();

describe("buildTableUrl", () => {
  it("uses lon,lat order and indexes sources then destinations", () => {
    const url = buildTableUrl(
      BASE,
      [
        { lat: 41.8781, lng: -87.6298 },
        { lat: 39.7684, lng: -86.1581 },
      ],
      [
        { lat: 40.4167, lng: -86.8753 },
        { lat: 40.1164, lng: -88.2434 },
        { lat: 41.0793, lng: -85.1394 },
      ]
    );
    expect(url).toBe(
      `${BASE}/table/v1/driving/` +
        "-87.629800,41.878100;-86.158100,39.768400;-86.875300,40.416700;-88.243400,40.116400;-85.139400,41.079300" +
        "?sources=0;1&destinations=2;3;4&annotations=duration,distance"
    );
  });

  it("rejects requests over the coordinate limit and empty sides", () => {
    const p = { lat: 40, lng: -86 };
    expect(() => buildTableUrl(BASE, Array(MAX_COORDINATES).fill(p), [p])).toThrow(/Too many places/);
    expect(() => buildTableUrl(BASE, Array(25).fill(p), Array(25).fill(p))).not.toThrow();
    expect(() => buildTableUrl(BASE, [], [p])).toThrow(OsrmError);
  });
});

describe("parseTableResponse", () => {
  it("returns durations (s) and distances (m) and maps null cells to no route", () => {
    const m = parseTableResponse(
      {
        code: "Ok",
        durations: [
          [3600.5, null],
          [120, 60],
        ],
        distances: [
          [100000, null],
          [2000, 1000],
        ],
      },
      2,
      2
    );
    expect(m.durationsSec).toEqual([
      [3600.5, null],
      [120, 60],
    ]);
    expect(m.distancesM[0][1]).toBeNull();
  });

  it("throws on code !== Ok with OSRM's message", () => {
    expect(() => parseTableResponse({ code: "InvalidQuery", message: "Query string malformed" }, 1, 1)).toThrow(
      /InvalidQuery: Query string malformed/
    );
    expect(() => parseTableResponse(null, 1, 1)).toThrow(OsrmError);
  });

  it("throws when the table shape doesn't match the request", () => {
    expect(() => parseTableResponse({ code: "Ok", durations: [[1]], distances: [[1]] }, 2, 1)).toThrow(/malformed/);
  });
});

describe("createOsrmRouter", () => {
  it("sends the User-Agent, caches by URL and reports OSRM errors", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ code: "Ok", durations: [[10]], distances: [[20]] })
    ) as unknown as typeof fetch;
    const router = createOsrmRouter({ baseUrl: BASE, userAgent: "Test/1.0", throttle: passthrough, fetchImpl });
    const a = { lat: 1, lng: 2 };
    const b = { lat: 3, lng: 4 };
    expect(await router.travelMatrix([a], [b])).toEqual({ durationsSec: [[10]], distancesM: [[20]] });
    await router.travelMatrix([a], [b]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1];
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe("Test/1.0");

    const failing = createOsrmRouter({
      baseUrl: BASE,
      userAgent: "Test/1.0",
      throttle: passthrough,
      fetchImpl: (async () => Response.json({ code: "NoTable" }, { status: 400 })) as typeof fetch,
    });
    await expect(failing.travelMatrix([a], [b])).rejects.toThrow(/NoTable/);
  });
});
