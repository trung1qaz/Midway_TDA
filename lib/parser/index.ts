import { serverConfig } from "@/lib/config";
import type { Member } from "@/types/member";
import type { ParsedMember } from "@/types/parsed";
import { createGeminiParser } from "./gemini";
import { fallbackParsedMember, normalizeParserOutput } from "./normalize";
import type { MemberParser } from "./types";

export class ParserUnavailableError extends Error {}

export function getMemberParser(): MemberParser {
  const config = serverConfig();
  if (!config.geminiApiKey) {
    throw new ParserUnavailableError(
      "GEMINI_API_KEY is not set. Add it to .env.local, or set MIDWAY_USE_MOCKS=true to use fixture data."
    );
  }
  return createGeminiParser({ apiKey: config.geminiApiKey, model: config.geminiModel });
}

export type ParseStatus = "ok" | "partial" | "failed";

export interface ParseOutcome {
  members: ParsedMember[];
  status: ParseStatus;
  parser: string;
}

// Never throws for provider errors: if the call fails every member gets a
// fallback, so the review page can still show (and let the user fix) them.
export async function parseMembers(
  parser: MemberParser,
  members: Member[],
  today: string
): Promise<ParseOutcome> {
  let raw: unknown;
  try {
    raw = await parser.parse(members, today);
  } catch (error) {
    // Log the failure, not the member text.
    console.error(`[parse] ${parser.name} call failed:`, error instanceof Error ? error.message : error);
    return {
      members: members.map((m) =>
        fallbackParsedMember(m, "The AI parser couldn't be reached, so this entry was not interpreted. Check it below.")
      ),
      status: "failed",
      parser: parser.name,
    };
  }

  const { members: parsed, fallbackCount } = normalizeParserOutput(raw, members);
  return {
    members: parsed,
    status: fallbackCount === 0 ? "ok" : fallbackCount === members.length ? "failed" : "partial",
    parser: parser.name,
  };
}
