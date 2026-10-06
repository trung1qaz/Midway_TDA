import { createCache, type AsyncCache } from "@/lib/http/cache";
import type { Throttle } from "@/lib/http/throttle";
import type { LatLng } from "@/types/parsed";
import type { Router, TravelMatrix } from "./types";

// OSRM `table` service: one request returns drive time and distance from
// every source to every destination. The public demo server is best-effort,
// allows ~1 request/second and requires attribution. Results are free-flow
// estimates with no live traffic.
// https://project-osrm.org/docs/v5.24.0/api/#table-service

export class OsrmError extends Error {}

// Keeps requests small and polite; the public server rejects large tables.
export const MAX_COORDINATES = 50;

export function buildTableUrl(
  baseUrl: string,
  sources: LatLng[],
  destinations: LatLng[],
  profile = "driving"
): string {
  if (sources.length === 0 || destinations.length === 0) {
    throw new OsrmError("A travel matrix needs at least one source and one destination.");
  }
  const total = sources.length + destinations.length;
  if (total > MAX_COORDINATES) {
    throw new OsrmError(
      `Too many places for one travel-time request (${total}; the limit is ${MAX_COORDINATES}). Try a smaller group.`
    );
  }
  // OSRM wants lon,lat (not lat,lon), separated by ";". Sources come first,
  // then destinations, and the query params index into that combined list.
  const coords = [...sources, ...destinations]
    .map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`)
    .join(";");
  const sourceIdx = sources.map((_, i) => i).join(";");
  const destIdx = destinations.map((_, j) => sources.length + j).join(";");
  return `${baseUrl}/table/v1/${profile}/${coords}?sources=${sourceIdx}&destinations=${destIdx}&annotations=duration,distance`;
}

function readGrid(grid: unknown, rows: number, cols: number, field: string): (number | null)[][] {
  if (!Array.isArray(grid) || grid.length !== rows) {
    throw new OsrmError(`OSRM response has a malformed "${field}" table.`);
  }
  return grid.map((row) => {
    if (!Array.isArray(row) || row.length !== cols) {
      throw new OsrmError(`OSRM response has a malformed "${field}" table.`);
    }
    // null means OSRM found no route between that pair (e.g. across water).
    return row.map((cell) => (typeof cell === "number" && Number.isFinite(cell) ? cell : null));
  });
}

export function parseTableResponse(json: unknown, sourceCount: number, destCount: number): TravelMatrix {
  if (typeof json !== "object" || json === null) {
    throw new OsrmError("OSRM returned an unreadable response.");
  }
  const body = json as { code?: unknown; message?: unknown; durations?: unknown; distances?: unknown };
  if (body.code !== "Ok") {
    const detail = typeof body.message === "string" ? `: ${body.message}` : "";
    throw new OsrmError(`OSRM couldn't compute travel times (${String(body.code ?? "no code")}${detail}).`);
  }
  return {
    durationsSec: readGrid(body.durations, sourceCount, destCount, "durations"),
    distancesM: readGrid(body.distances, sourceCount, destCount, "distances"),
  };
}

export interface OsrmOptions {
  baseUrl: string;
  userAgent: string;
  throttle: Throttle;
  cache?: AsyncCache<unknown>;
  fetchImpl?: typeof fetch;
}

export function createOsrmRouter(opts: OsrmOptions): Router {
  const cache = opts.cache ?? createCache<unknown>({ ttlMs: 60 * 60 * 1000, maxEntries: 200 });
  const fetchImpl = opts.fetchImpl ?? fetch;

  return {
    name: "osrm",
    async travelMatrix(sources, destinations) {
      const url = buildTableUrl(opts.baseUrl, sources, destinations);
      const json = await cache.get(url, () =>
        opts.throttle(async () => {
          const res = await fetchImpl(url, {
            headers: { "User-Agent": opts.userAgent, Accept: "application/json" },
            signal: AbortSignal.timeout(20_000),
          });
          // OSRM puts error details in a JSON body even on 4xx, so read it
          // before giving up on the status code.
          const body = await res.json().catch(() => null);
          if (!res.ok && !body) throw new OsrmError(`OSRM responded ${res.status}`);
          return body;
        })
      );
      return parseTableResponse(json, sources.length, destinations.length);
    },
  };
}
