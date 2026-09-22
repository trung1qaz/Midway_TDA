import type { Member } from "@/types/member";

// sessionStorage is the simplest way to carry data from the input page to
// /results without adding a backend or query-string encoding for free text.
const STORAGE_KEY = "midway.members";

export function saveMembers(members: Member[]): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(members));
}

export function loadMembers(): Member[] {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Member[];
  } catch {
    return [];
  }
}
