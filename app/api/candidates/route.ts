import { candidatesRequestSchema, jsonError, readJson } from "@/lib/api/schemas";
import { generateCandidates } from "@/lib/candidates";
import { mocksEnabled } from "@/lib/config";
import { getGeocoder, getRouter, getSettlementFinder } from "@/lib/geo/providers";
import type { CandidatesResponse } from "@/types/api";

// POST /api/candidates
// Body: { members: { id, name, point: { lat, lng } }[] } (confirmed on /review)
// Returns: CandidatesResponse
//
// Seeds -> reverse-geocode snapping (up to 2 Nominatim calls per seed at
// 1/s) -> one Overpass query for seeds outside town limits -> one OSRM table
// request. ~10–20 s on a cold cache, near-instant when cached.
// Candidates are returned in generation order. No scoring or ranking yet.
export async function POST(request: Request) {
  const body = candidatesRequestSchema.safeParse(await readJson(request));
  if (!body.success) {
    return jsonError("Invalid request body", 400, body.error.issues);
  }
  const members = body.data.members;
  const points = members.map((m) => m.point);

  let generated;
  try {
    generated = await generateCandidates(points, getGeocoder(), getSettlementFinder());
  } catch (error) {
    console.error("[candidates] place lookup failed:", error instanceof Error ? error.message : error);
    return jsonError(
      "The OpenStreetMap place lookup service isn't responding, so no meeting spots could be found. Try again in a minute, or switch to mock mode for a demo.",
      502
    );
  }

  const { seeds, candidates, dropped, notes } = generated;
  if (candidates.length === 0) {
    return jsonError(
      "No towns or cities were found near the group's meeting points (they may fall over water or very remote land).",
      422
    );
  }

  let matrix: CandidatesResponse["matrix"] = null;
  let matrixError: string | null = null;
  try {
    matrix = await getRouter().travelMatrix(
      points,
      candidates.map((c) => c.point)
    );
  } catch (error) {
    // Still return the candidates so the map works; the table shows the error.
    matrixError = error instanceof Error ? error.message : "Travel times are unavailable.";
    console.error("[candidates] travel matrix failed:", matrixError);
  }

  const response: CandidatesResponse = {
    members,
    candidates,
    matrix,
    matrixError,
    seedsTried: seeds.length,
    droppedSeeds: dropped.map((s) => s.label),
    notes,
    mock: mocksEnabled(),
  };
  return Response.json(response);
}
