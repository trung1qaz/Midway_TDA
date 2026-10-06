import { isoToday, jsonError, parseRequestSchema, readJson } from "@/lib/api/schemas";
import { getGeocoder } from "@/lib/geo/providers";
import { resolveMembers } from "@/lib/geo/resolveMembers";
import { getMemberParser, parseMembers, ParserUnavailableError } from "@/lib/parser";

// POST /api/parse
// Body: { members: Member[], today?: "YYYY-MM-DD" }
// Returns: { members: ResolvedMember[], status, parser }
//
// One batched LLM request, then one geocode per anchor (throttled to 1/s, so
// a 4-member group takes a few seconds). Nothing is persisted; member text is
// only forwarded to the parser provider and anchor strings to the geocoder.
export async function POST(request: Request) {
  const body = parseRequestSchema.safeParse(await readJson(request));
  if (!body.success) {
    return jsonError("Invalid request body", 400, body.error.issues);
  }

  let parser;
  try {
    parser = getMemberParser();
  } catch (error) {
    if (error instanceof ParserUnavailableError) return jsonError(error.message, 503);
    throw error;
  }

  const outcome = await parseMembers(parser, body.data.members, body.data.today ?? isoToday());
  const members = await resolveMembers(outcome.members, getGeocoder());
  return Response.json({ ...outcome, members });
}
