import type { Member } from "@/types/member";
import type { ParsedMember } from "@/types/parsed";
import { llmResponseSchema, parsedMemberSchema } from "./schema";

// Turns whatever a MemberParser returned into exactly one valid ParsedMember
// per input member, in input order. Anything that fails validation becomes a
// low-confidence fallback instead of failing the whole request.

export function fallbackParsedMember(member: Member, reason: string): ParsedMember {
  const raw = member.location.trim();
  return {
    id: member.id,
    name: member.name,
    location: {
      raw: member.location,
      kind: "point",
      anchors: [raw],
      interpretation: `Using the location text as typed: "${raw}"`,
    },
    availability: { raw: member.availability, windows: [] },
    budget: {
      raw: member.budget,
      maxPerPerson: null,
      currency: "USD",
      level: null,
    },
    confidence: "low",
    warnings: [reason],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Overwrite the fields the model must not control (id, name, raw text) with
// the original input, then validate the whole thing.
function assemble(member: Member, item: Record<string, unknown>): unknown {
  const location = isRecord(item.location) ? item.location : {};
  const availability = isRecord(item.availability) ? item.availability : {};
  const budget = isRecord(item.budget) ? item.budget : {};
  return {
    ...item,
    id: member.id,
    name: member.name,
    location: {
      ...location,
      raw: member.location,
      anchors: Array.isArray(location.anchors)
        ? location.anchors.map((a) => (typeof a === "string" ? a.trim() : a))
        : location.anchors,
    },
    availability: { ...availability, raw: member.availability },
    budget: {
      ...budget,
      raw: member.budget,
      // An empty or missing currency falls back to the documented default.
      currency:
        typeof budget.currency === "string" && budget.currency.trim()
          ? budget.currency.trim().toUpperCase()
          : "USD",
    },
  };
}

export interface NormalizedOutput {
  members: ParsedMember[];
  fallbackCount: number;
}

export function normalizeParserOutput(raw: unknown, members: Member[]): NormalizedOutput {
  const envelope = llmResponseSchema.safeParse(raw);
  if (!envelope.success) {
    return {
      members: members.map((m) =>
        fallbackParsedMember(m, "The AI parser returned an unreadable response, so this entry was not interpreted. Check it below.")
      ),
      fallbackCount: members.length,
    };
  }

  const byId = new Map<string, Record<string, unknown>>();
  for (const item of envelope.data.members) {
    if (isRecord(item) && typeof item.id === "string" && !byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }

  let fallbackCount = 0;
  const parsed = members.map((member) => {
    const item = byId.get(member.id);
    if (!item) {
      fallbackCount++;
      return fallbackParsedMember(member, "The AI parser skipped this entry, so it was not interpreted. Check it below.");
    }
    const result = parsedMemberSchema.safeParse(assemble(member, item));
    if (!result.success) {
      fallbackCount++;
      return fallbackParsedMember(member, "The AI parser's reading of this entry didn't pass validation, so the location text is used as typed. Check it below.");
    }
    return result.data;
  });
  return { members: parsed, fallbackCount };
}
