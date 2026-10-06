import type { Member } from "@/types/member";
import type { ResolvedMember } from "@/types/parsed";

// sessionStorage is the simplest way to carry data between pages without
// adding a backend or query-string encoding for free text. Data lives only in
// this browser tab and is gone when it closes.
//
//   midway.members   raw form input           (form   -> /review)
//   midway.resolved  parser + geocode output  (/review, survives reloads)
//   midway.confirmed what the user confirmed  (/review -> /results)
const STORAGE_KEY = "midway.members";
const RESOLVED_KEY = "midway.resolved";
const CONFIRMED_KEY = "midway.confirmed";

function save(key: string, value: unknown): void {
  sessionStorage.setItem(key, JSON.stringify(value));
}

function load<T>(key: string): T[] {
  const raw = sessionStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function newMemberId(): string {
  return crypto.randomUUID();
}

// Submitting the form starts a new run, so earlier parse/confirm results are
// cleared.
export function saveMembers(members: Member[]): void {
  save(STORAGE_KEY, members);
  sessionStorage.removeItem(RESOLVED_KEY);
  sessionStorage.removeItem(CONFIRMED_KEY);
}

export function loadMembers(): Member[] {
  // Members saved before ids existed get one so downstream keys stay stable.
  return load<Member>(STORAGE_KEY).map((m) => (m.id ? m : { ...m, id: newMemberId() }));
}

export function saveResolvedMembers(members: ResolvedMember[]): void {
  save(RESOLVED_KEY, members);
}

export function loadResolvedMembers(): ResolvedMember[] {
  return load<ResolvedMember>(RESOLVED_KEY);
}

export function saveConfirmedMembers(members: ResolvedMember[]): void {
  save(CONFIRMED_KEY, members);
}

export function loadConfirmedMembers(): ResolvedMember[] {
  return load<ResolvedMember>(CONFIRMED_KEY);
}
