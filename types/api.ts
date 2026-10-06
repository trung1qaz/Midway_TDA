import type { TravelMatrix } from "@/lib/geo/types";
import type { Candidate } from "./candidates";
import type { LatLng, ResolvedMember } from "./parsed";

// Response shapes of our own API routes, shared by route handlers and pages.

export interface ParseResponse {
  members: ResolvedMember[];
  status: "ok" | "partial" | "failed";
  parser: string;
}

export interface CandidateMember {
  id: string;
  name: string;
  point: LatLng;
}

export interface CandidatesResponse {
  members: CandidateMember[];
  candidates: Candidate[];
  // Rows = members (same order), columns = candidates (same order).
  // null when the travel-time service failed; cells are null for "no route".
  matrix: TravelMatrix | null;
  matrixError: string | null;
  seedsTried: number;
  droppedSeeds: string[]; // labels of seeds with no town nearby
}
