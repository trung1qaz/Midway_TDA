import { createCache, type AsyncCache } from "@/lib/http/cache";
import type { Throttle } from "@/lib/http/throttle";
import type { LatLng } from "@/types/parsed";
import type { Place, SettlementFinder } from "./types";

// Overpass API: finds OSM place=city|town|village nodes near a set of points.
// Used as the fallback for candidate snapping, because Nominatim's reverse
// lookup returns the *enclosing* area (often a county) rather than the
// nearest town when a seed falls in unincorporated land. All seeds that
// missed are covered by one query. Public instance is free with no key but
// rate-limited per IP; results are cached and failures are non-fatal.
// https://wiki.openstreetmap.org/wiki/Overpass_API

export class OverpassError extends Error {}

const SETTLEMENT_REGEX = "^(city|town|village)$";
const RETRY_DELAY_MS = 2000;

export function buildOverpassQuery(points: LatLng[], radiusKm: number): string {
  const radiusM = Math.round(radiusKm * 1000);
  const clauses = points
    .map((p) => `node[place~"${SETTLEMENT_REGEX}"][name](around:${radiusM},${p.lat.toFixed(5)},${p.lng.toFixed(5)});`)
    .join("");
  return `[out:json][timeout:25];(${clauses});out body;`;
}

interface OverpassElement {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
}

export function parseOverpassResponse(json: unknown): Place[] {
  if (typeof json !== "object" || json === null || !Array.isArray((json as { elements?: unknown }).elements)) {
    throw new OverpassError("Overpass returned an unreadable response.");
  }
  const places: Place[] = [];
  for (const el of (json as { elements: OverpassElement[] }).elements) {
    const name = el.tags?.name?.trim();
    const placeType = el.tags?.place;
    if (el.type !== "node" || el.id == null || !name || !placeType) continue;
    if (typeof el.lat !== "number" || typeof el.lon !== "number") continue;
    places.push({
      point: { lat: el.lat, lng: el.lon },
      name,
      // Overpass doesn't give an address; snap.ts adds regional context.
      displayName: name,
      osmType: "node",
      osmId: el.id,
      isSettlement: true,
      placeType,
    });
  }
  return places;
}

export interface OverpassOptions {
  baseUrl: string; // full interpreter URL
  userAgent: string;
  throttle: Throttle;
  cache?: AsyncCache<unknown>;
  fetchImpl?: typeof fetch;
}

export function createOverpassFinder(opts: OverpassOptions): SettlementFinder {
  const cache = opts.cache ?? createCache<unknown>({ ttlMs: 24 * 60 * 60 * 1000, maxEntries: 200 });
  const fetchImpl = opts.fetchImpl ?? fetch;

  return {
    name: "overpass",
    async nearbySettlements(points, radiusKm) {
      if (points.length === 0) return [];
      const query = buildOverpassQuery(points, radiusKm);
      const request = () =>
        opts.throttle(async () => {
          const res = await fetchImpl(opts.baseUrl, {
            method: "POST",
            headers: {
              "User-Agent": opts.userAgent,
              "Content-Type": "application/x-www-form-urlencoded",
              Accept: "application/json",
            },
            body: new URLSearchParams({ data: query }).toString(),
            signal: AbortSignal.timeout(30_000),
          });
          if (!res.ok) throw new OverpassError(`Overpass responded ${res.status}`, { cause: res.status });
          // Overload errors come back as HTML/XML with status 200.
          return res.json().catch(() => {
            throw new OverpassError("Overpass is busy right now (non-JSON response).", { cause: "busy" });
          });
        });
      // The public instance often answers 429/504 under load; one retry
      // after a short pause usually succeeds.
      const json = await cache.get(query, () =>
        request().catch(async (error) => {
          if (!(error instanceof OverpassError) || ![429, 504, "busy"].includes(error.cause as never)) throw error;
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          return request();
        })
      );
      return parseOverpassResponse(json);
    },
  };
}
