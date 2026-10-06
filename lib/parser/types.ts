import type { Member } from "@/types/member";

// A provider that turns raw member input into *unvalidated* JSON shaped like
// { members: [...] }. Validation and fallbacks happen in normalize.ts, so any
// provider (Gemini, fixtures, a future model) gets the same safety net.
export interface MemberParser {
  readonly name: string;
  parse(members: Member[], today: string): Promise<unknown>;
}
