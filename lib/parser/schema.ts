import { z } from "zod";
import type { ParsedMember } from "@/types/parsed";

// zod mirror of ParsedMember. Every LLM response is validated against this,
// even with Gemini's structured output turned on, because structured output
// constrains shape but not rules like "between needs 2+ anchors".

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const weekdaySchema = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

export const availabilityWindowSchema = z.object({
  days: z.array(weekdaySchema).nullable(),
  date: isoDate.nullable(),
  start: hhmm.nullable(),
  end: hhmm.nullable(),
  label: z.string(),
});

const locationShape = z
  .object({
    raw: z.string(),
    kind: z.enum(["point", "area", "between"]),
    anchors: z.array(z.string().trim().min(1)).min(1),
    interpretation: z.string(),
  })
  .refine((loc) => loc.kind !== "between" || loc.anchors.length >= 2, {
    message: '"between" locations need at least two anchors',
    path: ["anchors"],
  });

const budgetShape = z.object({
  raw: z.string(),
  maxPerPerson: z.number().nonnegative().nullable(),
  currency: z.string().trim().min(1).default("USD"),
  level: z.enum(["low", "medium", "high"]).nullable(),
});

export const parsedMemberSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  location: locationShape,
  availability: z.object({
    raw: z.string(),
    windows: z.array(availabilityWindowSchema),
  }),
  budget: budgetShape,
  confidence: z.enum(["high", "medium", "low"]),
  warnings: z.array(z.string()),
});

// Compile-time check that the schema and the hand-written type agree.
type SchemaOutput = z.output<typeof parsedMemberSchema>;
type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
export const _schemaMatchesType: AssertEqual<SchemaOutput, ParsedMember> = true;

// The LLM returns a list under "members"; each item is validated on its own
// (see normalize.ts) so one bad item doesn't sink the rest.
export const llmResponseSchema = z.object({
  members: z.array(z.unknown()),
});
