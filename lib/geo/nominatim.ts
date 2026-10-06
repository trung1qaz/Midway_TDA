import { createCache, type AsyncCache } from "@/lib/http/cache";
import type { Throttle } from "@/lib/http/throttle";
import type { LatLng } from "@/types/parsed";
import type { Geocoder, Place } from "./types";

// OSM Nominatim geocoder (forward + reverse). Server-side only: the usage
// policy requires a descriptive User-Agent, which browsers can't set, plus
// <= 1 request/second and caching of results.
// https://operations.osmfoundation.org/policies/nominatim/

export class NominatimError extends Error {}

// Nominatim `addresstype` values treated as real settlements for candidate
// snapping. Hamlets, suburbs and neighbourhoods are deliberately excluded so
// candidates are places a group could plausibly name as a destination.
const SETTLEMENT_TYPES = new Set(["city", "town", "village"]);

// Subset of a jsonv2 result that we read.
interface NominatimJson {
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  category?: string;
  type?: string;
  addresstype?: string;
}

export function buildSearchUrl(baseUrl: string, query: string): string {
  const url = new URL(`${baseUrl}/search`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", query);
  return url.toString();
}

export function buildReverseUrl(baseUrl: string, point: LatLng, zoom: number): string {
  const url = new URL(`${baseUrl}/reverse`);
  url.searchParams.set("format", "jsonv2");
  // ~1 m precision is plenty and keeps cache keys stable.
  url.searchParams.set("lat", point.lat.toFixed(5));
  url.searchParams.set("lon", point.lng.toFixed(5));
  url.searchParams.set("zoom", String(zoom));
  return url.toString();
}

export function isSettlementResult(json: Pick<NominatimJson, "addresstype" | "category" | "type">): boolean {
  if (json.addresstype && SETTLEMENT_TYPES.has(json.addresstype)) return true;
  // Older responses may lack addresstype; fall back to place=* tags.
  return json.category === "place" && !!json.type && SETTLEMENT_TYPES.has(json.type);
}

// Converts one jsonv2 result to a Place, or null if it is unusable.
export function parsePlace(json: unknown): Place | null {
  if (typeof json !== "object" || json === null) return null;
  const r = json as NominatimJson;
  const lat = Number(r.lat);
  const lng = Number(r.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !r.osm_type || r.osm_id == null) {
    return null;
  }
  const displayName = r.display_name ?? "";
  return {
    point: { lat, lng },
    name: r.name?.trim() || displayName.split(",")[0]?.trim() || "Unnamed place",
    displayName,
    osmType: r.osm_type,
    osmId: Number(r.osm_id),
    isSettlement: isSettlementResult(r),
    placeType: r.addresstype ?? r.type ?? "unknown",
  };
}

export function parseSearchResponse(json: unknown): Place | null {
  return Array.isArray(json) && json.length > 0 ? parsePlace(json[0]) : null;
}

export function parseReverseResponse(json: unknown): Place | null {
  // Reverse returns { error: "Unable to geocode" } over oceans etc.
  if (typeof json === "object" && json !== null && "error" in json) return null;
  return parsePlace(json);
}

export interface NominatimOptions {
  baseUrl: string;
  userAgent: string;
  throttle: Throttle;
  cache?: AsyncCache<unknown>;
  fetchImpl?: typeof fetch;
}

export function createNominatimGeocoder(opts: NominatimOptions): Geocoder {
  const cache = opts.cache ?? createCache<unknown>({ ttlMs: 24 * 60 * 60 * 1000, maxEntries: 2000 });
  const fetchImpl = opts.fetchImpl ?? fetch;

  // Cache wraps the throttle, so repeated lookups never wait for a slot.
  const getJson = (url: string) =>
    cache.get(url, () =>
      opts.throttle(async () => {
        const res = await fetchImpl(url, {
          headers: { "User-Agent": opts.userAgent, Accept: "application/json" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
          throw new NominatimError(`Nominatim responded ${res.status} ${res.statusText}`.trim());
        }
        return res.json();
      })
    );

  return {
    name: "nominatim",
    async geocode(query) {
      return parseSearchResponse(await getJson(buildSearchUrl(opts.baseUrl, query)));
    },
    async reverseGeocode(point, zoom) {
      return parseReverseResponse(await getJson(buildReverseUrl(opts.baseUrl, point, zoom)));
    },
  };
}
