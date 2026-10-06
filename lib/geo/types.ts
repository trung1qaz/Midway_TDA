import type { LatLng } from "@/types/parsed";

// Provider-neutral interfaces for geocoding and routing. Callers depend on
// these, not on Nominatim/OSRM, so a different or self-hosted provider can be
// swapped in via lib/geo/providers.ts.

export interface Place {
  point: LatLng;
  name: string;
  displayName: string;
  // OSM identity. Nominatim's place_id is not stable across its database
  // reloads, so osm_type + osm_id is used wherever an id is needed.
  osmType: string;
  osmId: number;
  // True when the result is a city, town or village (used to snap candidate
  // seeds onto real settlements).
  isSettlement: boolean;
  placeType: string;
}

export interface Geocoder {
  readonly name: string;
  geocode(query: string): Promise<Place | null>;
  reverseGeocode(point: LatLng, zoom: number): Promise<Place | null>;
}

// Row i = source i, column j = destination j. null = no route.
export interface TravelMatrix {
  durationsSec: (number | null)[][];
  distancesM: (number | null)[][];
}

export interface Router {
  readonly name: string;
  travelMatrix(sources: LatLng[], destinations: LatLng[]): Promise<TravelMatrix>;
}

export function placeKey(place: Pick<Place, "osmType" | "osmId">): string {
  return `${place.osmType}/${place.osmId}`;
}
