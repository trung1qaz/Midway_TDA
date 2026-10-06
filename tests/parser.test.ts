import { describe, expect, it } from "vitest";
import { parseMembers } from "@/lib/parser";
import { fallbackParsedMember, normalizeParserOutput } from "@/lib/parser/normalize";
import { parsedMemberSchema } from "@/lib/parser/schema";
import type { MemberParser } from "@/lib/parser/types";
import { mockParseMember } from "@/lib/mocks/parser";
import type { Member } from "@/types/member";

const alex: Member = {
  id: "a1",
  name: "Alex",
  location: "between Chicago and Indy",
  availability: "weekday evenings",
  budget: "under $40",
};
const bea: Member = {
  id: "b2",
  name: "Bea",
  location: "somewhere in Ohio",
  availability: "",
  budget: "cheap",
};

const goodItem = (id: string) => ({
  id,
  location: {
    kind: "between",
    anchors: ["Chicago, Illinois", "Indianapolis, Indiana"],
    interpretation: "Between Chicago and Indianapolis.",
  },
  availability: {
    windows: [
      { days: ["mon", "tue", "wed", "thu", "fri"], date: null, start: "18:00", end: null, label: "Weekday evenings" },
    ],
  },
  budget: { maxPerPerson: 40, currency: "usd", level: null },
  confidence: "medium",
  warnings: [],
});

describe("normalizeParserOutput", () => {
  it("accepts valid output and restores id, name and raw text from the input", () => {
    const item = { ...goodItem("a1"), name: "Injected", location: { ...goodItem("a1").location, raw: "tampered" } };
    const { members, fallbackCount } = normalizeParserOutput({ members: [item] }, [alex]);
    expect(fallbackCount).toBe(0);
    const [m] = members;
    expect(m.name).toBe("Alex");
    expect(m.location.raw).toBe(alex.location);
    expect(m.availability.raw).toBe(alex.availability);
    expect(m.budget.raw).toBe(alex.budget);
    expect(m.budget.currency).toBe("USD");
    expect(parsedMemberSchema.safeParse(m).success).toBe(true);
  });

  it("falls back for one malformed member without affecting the others", () => {
    const bad = { ...goodItem("b2"), confidence: "very sure" };
    const { members, fallbackCount } = normalizeParserOutput({ members: [goodItem("a1"), bad] }, [alex, bea]);
    expect(fallbackCount).toBe(1);
    expect(members[0].confidence).toBe("medium");
    expect(members[1].confidence).toBe("low");
    expect(members[1].location.anchors).toEqual(["somewhere in Ohio"]);
    expect(members[1].warnings[0]).toMatch(/didn't pass validation/);
  });

  it('rejects a "between" location with fewer than two anchors', () => {
    const item = goodItem("a1");
    item.location.anchors = ["Chicago"];
    const { members } = normalizeParserOutput({ members: [item] }, [alex]);
    expect(members[0].confidence).toBe("low");
  });

  it("rejects malformed times and dates", () => {
    const item = goodItem("a1");
    item.availability.windows[0].start = "6pm";
    expect(normalizeParserOutput({ members: [item] }, [alex]).fallbackCount).toBe(1);
  });

  it("falls back for members the model skipped or for an unreadable envelope", () => {
    expect(normalizeParserOutput({ members: [goodItem("a1")] }, [alex, bea]).members[1].warnings[0]).toMatch(
      /skipped/
    );
    const all = normalizeParserOutput("not json", [alex, bea]);
    expect(all.fallbackCount).toBe(2);
    expect(all.members.every((m) => m.confidence === "low")).toBe(true);
  });

  it("keeps input order regardless of model output order", () => {
    const { members } = normalizeParserOutput({ members: [goodItem("b2"), goodItem("a1")] }, [alex, bea]);
    expect(members.map((m) => m.id)).toEqual(["a1", "b2"]);
  });
});

describe("fallbackParsedMember", () => {
  it("is schema-valid and uses the raw location as the only anchor", () => {
    const fb = fallbackParsedMember(bea, "reason");
    expect(parsedMemberSchema.safeParse(fb).success).toBe(true);
    expect(fb.location.anchors).toEqual(["somewhere in Ohio"]);
    expect(fb.warnings).toEqual(["reason"]);
  });
});

describe("parseMembers", () => {
  it("returns fallbacks with status failed when the provider throws", async () => {
    const broken: MemberParser = {
      name: "broken",
      parse: async () => {
        throw new Error("429 quota");
      },
    };
    const outcome = await parseMembers(broken, [alex, bea], "2026-10-06");
    expect(outcome.status).toBe("failed");
    expect(outcome.members).toHaveLength(2);
    expect(outcome.members.every((m) => m.confidence === "low")).toBe(true);
  });

  it("reports partial when only some members fall back", async () => {
    const half: MemberParser = { name: "half", parse: async () => ({ members: [goodItem("a1")] }) };
    expect((await parseMembers(half, [alex, bea], "2026-10-06")).status).toBe("partial");
  });
});

describe("mock parser output", () => {
  it("passes the same validation as the LLM path", () => {
    const sam: Member = {
      id: "s",
      name: "Sam",
      location: "Champaign, IL",
      availability: "next Saturday, maybe Sunday too?",
      budget: "whatever works",
    };
    const { members, fallbackCount } = normalizeParserOutput(
      { members: [alex, bea, sam].map((m) => mockParseMember(m, "2026-10-06")) },
      [alex, bea, sam]
    );
    expect(fallbackCount).toBe(0);
    expect(members[0].location.kind).toBe("between");
    expect(members[0].location.anchors).toEqual(["Chicago", "Indianapolis, Indiana"]);
    expect(members[1].location.kind).toBe("area");
    expect(members[1].budget.level).toBe("low");
    expect(members[2].availability.windows[0].date).toBe("2026-10-10");
  });
});

describe("isTransientGeminiError", () => {
  it("retries on 503/429 capacity errors only", async () => {
    const { isTransientGeminiError } = await import("@/lib/parser/gemini");
    expect(isTransientGeminiError(new Error('{"error":{"code":503,"message":"high demand","status":"UNAVAILABLE"}}'))).toBe(true);
    expect(isTransientGeminiError(new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}'))).toBe(true);
    expect(isTransientGeminiError(new Error('{"error":{"code":400,"message":"API key not valid"}}'))).toBe(false);
  });
});
