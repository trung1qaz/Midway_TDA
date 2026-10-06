// Structured interpretation of one member's free-text input, produced by the
// AI parser (lib/parser) and confirmed by the user on /review.
// The matching zod schema lives in lib/parser/schema.ts.

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export const WEEKDAYS: readonly Weekday[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

export type LocationKind = "point" | "area" | "between";
export type Confidence = "high" | "medium" | "low";
export type BudgetLevel = "low" | "medium" | "high";

export interface AvailabilityWindow {
  days: Weekday[] | null;
  date: string | null; // ISO date (YYYY-MM-DD) if a specific day was given
  start: string | null; // "HH:MM", 24h
  end: string | null;
  label: string; // e.g. "Weekday evenings"
}

export interface ParsedMember {
  id: string; // carried over from Member, never changed by the LLM
  name: string;
  location: {
    raw: string;
    kind: LocationKind;
    anchors: string[]; // geocodable place strings; 2+ for "between"
    interpretation: string; // one-line plain-English reading for the review page
  };
  availability: {
    raw: string;
    windows: AvailabilityWindow[];
  };
  budget: {
    raw: string;
    maxPerPerson: number | null;
    currency: string; // default "USD"
    level: BudgetLevel | null;
  };
  confidence: Confidence;
  warnings: string[];
}

export interface LatLng {
  lat: number;
  lng: number;
}

// One anchor string after geocoding.
export interface ResolvedAnchor {
  query: string;
  displayName: string;
  point: LatLng;
  osmType: string;
  osmId: number;
}

// ParsedMember plus geocoding results. `point` is the member's effective
// location: the anchor for "point"/"area", or the geographic midpoint of the
// anchors for "between". null means nothing could be resolved, which blocks
// the review step.
export interface ResolvedMember extends ParsedMember {
  resolution: {
    anchors: ResolvedAnchor[];
    unresolved: string[];
    point: LatLng | null;
  };
  editedByUser?: boolean;
}
