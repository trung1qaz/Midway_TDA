import type { Member } from "@/types/member";
import type { AvailabilityWindow, BudgetLevel, Confidence, LocationKind, Weekday } from "@/types/parsed";
import type { MemberParser } from "@/lib/parser/types";
import { STATE_NAMES } from "./gazetteer";

// Mock-mode parser: simple regex rules instead of Gemini. Handles the sample
// group's phrasing and common patterns well enough to demo the flow with no
// API key. Output has the same shape as the LLM's, so it goes through the
// same zod validation and fallbacks.

const DAY_WORDS: [RegExp, Weekday][] = [
  [/\bmon(day)?s?\b/i, "mon"],
  [/\btue(s|sday)?s?\b/i, "tue"],
  [/\bwed(nesday)?s?\b/i, "wed"],
  [/\bthu(rs|rsday)?s?\b/i, "thu"],
  [/\bfri(day)?s?\b/i, "fri"],
  [/\bsat(urday)?s?\b/i, "sat"],
  [/\bsun(day)?s?\b/i, "sun"],
];
const DAY_INDEX: Record<Weekday, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const DAY_NAME: Record<Weekday, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const NICKNAMES: Record<string, string> = { indy: "Indianapolis, Indiana", chi: "Chicago, Illinois" };
const STATE_SET = new Set(Object.values(STATE_NAMES).map((s) => s.toLowerCase()));

function cleanPlace(s: string): string {
  const trimmed = s.trim().replace(/[.?!]+$/, "");
  return NICKNAMES[trimmed.toLowerCase()] ?? trimmed;
}

function parseLocation(raw: string) {
  const text = raw.trim();
  const warnings: string[] = [];
  let kind: LocationKind = "point";
  let anchors = [cleanPlace(text.replace(/^(near|around|close to)\s+/i, ""))];
  let interpretation = `A specific place: ${anchors[0]}.`;
  let confidence: Confidence = "high";

  const between = text.match(/between\s+(.+?)\s+(?:and|&)\s+(.+)/i);
  const area = text.match(/^(?:somewhere|anywhere)\s+(?:in|around|near)\s+(.+)/i);
  if (between) {
    kind = "between";
    anchors = [cleanPlace(between[1]), cleanPlace(between[2])];
    interpretation = `Somewhere between ${anchors[0]} and ${anchors[1]}; using the midpoint.`;
    confidence = "medium";
    warnings.push("Exact location between the two places is unknown, so the midpoint is used.");
  } else if (area) {
    const place = cleanPlace(area[1]);
    anchors = [place];
    if (STATE_SET.has(place.toLowerCase())) {
      kind = "area";
      interpretation = `Somewhere in the state of ${place}; using its center.`;
      confidence = "medium";
      warnings.push(`"${text}" covers a large area, so the center of ${place} is used. Add a city for a better result.`);
    } else {
      interpretation = `Somewhere around ${place}.`;
      confidence = "medium";
    }
  }
  return { location: { kind, anchors, interpretation }, warnings, confidence };
}

function to24h(hour: number, minute: number, meridiem: string | undefined, assumePm: boolean): string {
  const m = meridiem?.toLowerCase();
  const h = (hour % 12) + (m === "pm" || (!m && assumePm) ? 12 : 0);
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function nextWeekdayDate(today: string, day: Weekday): string {
  const d = new Date(`${today}T12:00:00Z`);
  const diff = (DAY_INDEX[day] - d.getUTCDay() + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function parseAvailability(raw: string, today: string) {
  const text = raw.trim();
  const warnings: string[] = [];
  if (!text) return { windows: [] as AvailabilityWindow[], warnings, vague: true };

  let days: Weekday[] | null = null;
  if (/\bweekdays?\b/i.test(text)) days = ["mon", "tue", "wed", "thu", "fri"];
  else if (/\bweekends?\b/i.test(text)) days = ["sat", "sun"];
  else {
    const found = DAY_WORDS.filter(([re]) => re.test(text)).map(([, d]) => d);
    if (found.length) days = found;
  }

  let start: string | null = null;
  let end: string | null = null;
  const range = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-|–|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  const after = text.match(/after\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (range) {
    const startHour = Number(range[1]);
    const endHour = Number(range[4]);
    const startMeridiem = range[3] ?? undefined;
    // "9 to 5": an end without am/pm inherits the start's, or is pm if it
    // would otherwise come before the start.
    const endMeridiem = range[6] ?? startMeridiem;
    start = to24h(startHour, Number(range[2] ?? 0), startMeridiem, false);
    end = to24h(endHour, Number(range[5] ?? 0), endMeridiem, !endMeridiem && endHour <= startHour);
  } else if (after) {
    // "after 6" with no am/pm almost always means evening.
    start = to24h(Number(after[1]), Number(after[2] ?? 0), after[3] ?? undefined, true);
  } else if (/\bevenings?\b/i.test(text)) {
    start = "18:00";
  } else if (/\bmornings?\b/i.test(text)) {
    start = "08:00";
    end = "12:00";
  } else if (/\bafternoons?\b/i.test(text)) {
    start = "12:00";
    end = "17:00";
  }

  const vague = /\bmaybe\b|\?|\bnot sure\b|\bflexible\b/i.test(text);
  const timeLabel = start ? (end ? ` ${start}–${end}` : ` from ${start}`) : "";
  const windows: AvailabilityWindow[] = [];

  const nextDay = text.match(/\bnext\s+(mon|tue|wed|thu|fri|sat|sun)[a-z]*/i);
  if (nextDay) {
    const day = nextDay[1].toLowerCase() as Weekday;
    const date = nextWeekdayDate(today, day);
    windows.push({ days: null, date, start, end, label: `Next ${DAY_NAME[day]} (${date})${timeLabel}` });
    // Any other day mentioned ("maybe Sunday too") becomes its own window.
    for (const d of days ?? []) {
      if (d !== day) windows.push({ days: [d], date: null, start, end, label: `${DAY_NAME[d]}s (tentative)` });
    }
  } else if (days || start) {
    const dayLabel =
      days?.length === 5 && !days.includes("sat")
        ? "Weekdays"
        : days?.length === 2 && days.includes("sat") && days.includes("sun")
          ? "Weekends"
          : days?.map((d) => `${DAY_NAME[d]}s`).join(", ") ?? "Any day";
    const evenings = /\bevenings?\b/i.test(text) && !after;
    const label = evenings
      ? `${dayLabel === "Weekdays" ? "Weekday" : dayLabel} evenings (from ${start})`
      : `${dayLabel}${timeLabel}`;
    windows.push({ days, date: null, start, end, label });
  } else {
    warnings.push(`Couldn't read a time from "${text}". Add the days or times on this page.`);
  }
  if (vague) warnings.push("Availability sounds tentative; confirm it with this person.");
  return { windows, warnings, vague: vague || windows.length === 0 };
}

function parseBudget(raw: string) {
  const text = raw.trim();
  const warnings: string[] = [];
  let maxPerPerson: number | null = null;
  let level: BudgetLevel | null = null;

  const range = text.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*\$?\s*(\d+(?:\.\d+)?)/);
  const cap = text.match(/(?:under|below|less than|max(?:imum)?|up to|no more than)\s*\$?\s*(\d+(?:\.\d+)?)/i);
  const amount = text.match(/\$\s*(\d+(?:\.\d+)?)/);
  if (range) maxPerPerson = Number(range[2]);
  else if (cap) maxPerPerson = Number(cap[1]);
  else if (amount) maxPerPerson = Number(amount[1]);

  if (/\b(cheap|budget|broke|inexpensive|low)\b/i.test(text)) level = "low";
  else if (/\b(moderate|mid|medium)\b/i.test(text)) level = "medium";
  else if (/\b(splurge|fancy|expensive|high)\b/i.test(text)) level = "high";

  const vague = !text || /whatever|flexible|any|don'?t care|no preference/i.test(text);
  if (text && vague && maxPerPerson == null) warnings.push("No budget limit given, so budget is left open.");
  if (level === "low" && maxPerPerson == null) warnings.push(`"${text}" has no dollar amount; treated as a low budget.`);
  return { budget: { maxPerPerson, currency: "USD", level }, warnings, vague: vague && maxPerPerson == null };
}

function lower(a: Confidence, b: Confidence): Confidence {
  const order: Confidence[] = ["low", "medium", "high"];
  return order[Math.min(order.indexOf(a), order.indexOf(b))];
}

export function mockParseMember(member: Member, today: string) {
  const loc = parseLocation(member.location);
  const avail = parseAvailability(member.availability, today);
  const budget = parseBudget(member.budget);
  let confidence: Confidence = loc.confidence;
  if (avail.vague || budget.vague) confidence = lower(confidence, "medium");
  return {
    id: member.id,
    location: loc.location,
    availability: { windows: avail.windows },
    budget: budget.budget,
    confidence,
    warnings: [...loc.warnings, ...avail.warnings, ...budget.warnings],
  };
}

export function createMockParser(): MemberParser {
  return {
    name: "mock-rules",
    async parse(members, today) {
      return { members: members.map((m) => mockParseMember(m, today)) };
    },
  };
}
