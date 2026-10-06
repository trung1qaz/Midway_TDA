import type { ResolvedMember } from "./parsed";

// Response shapes of our own API routes, shared by route handlers and pages.

export interface ParseResponse {
  members: ResolvedMember[];
  status: "ok" | "partial" | "failed";
  parser: string;
}
