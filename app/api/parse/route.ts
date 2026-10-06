import { isoToday, jsonError, parseRequestSchema, readJson } from "@/lib/api/schemas";
import { getMemberParser, parseMembers, ParserUnavailableError } from "@/lib/parser";

// POST /api/parse
// Body: { members: Member[], today?: "YYYY-MM-DD" }
// Returns: { members: ParsedMember[], status, parser }
//
// One batched LLM request per call. Nothing is persisted; member text is
// only forwarded to the parser provider.
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
  return Response.json(outcome);
}
