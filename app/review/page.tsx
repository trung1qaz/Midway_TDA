"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import DemoBanner from "@/components/DemoBanner";
import ReviewMemberCard from "@/components/review/ReviewMemberCard";
import { localIsoDate, postJson } from "@/lib/api/client";
import {
  loadMembers,
  loadResolvedMembers,
  saveConfirmedMembers,
  saveResolvedMembers,
} from "@/lib/memberStorage";
import type { ParseResponse } from "@/types/api";
import type { Member } from "@/types/member";
import type { ResolvedMember } from "@/types/parsed";

type LoadState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ready"; status: ParseResponse["status"] | "restored"; parser?: string };

// Stored parse results are reused only if they belong to the current form
// submission (same member ids in the same order).
function sameMembers(members: Member[], resolved: ResolvedMember[]): boolean {
  return members.length === resolved.length && members.every((m, i) => m.id === resolved[i].id);
}

export default function ReviewPage() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [members, setMembers] = useState<ResolvedMember[]>([]);
  const [recheckingId, setRecheckingId] = useState<string | null>(null);
  const [recheckError, setRecheckError] = useState<string | null>(null);
  // Guards against React Strict Mode running the effect twice in dev, which
  // would otherwise send a second (rate-limited) LLM request.
  const started = useRef(false);

  const runParse = useCallback(async () => {
    const input = loadMembers();
    if (input.length === 0) {
      setState({ kind: "empty" });
      return;
    }
    const stored = loadResolvedMembers();
    if (sameMembers(input, stored)) {
      setMembers(stored);
      setState({ kind: "ready", status: "restored" });
      return;
    }
    setState({ kind: "loading" });
    try {
      const res = await postJson<ParseResponse>("/api/parse", {
        members: input,
        today: localIsoDate(),
      });
      setMembers(res.members);
      saveResolvedMembers(res.members);
      setState({ kind: "ready", status: res.status, parser: res.parser });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // sessionStorage is browser-only, so parsing kicks off after mount.
    void Promise.resolve().then(runParse);
  }, [runParse]);

  function updateMember(updated: ResolvedMember) {
    setMembers((prev) => {
      const next = prev.map((m) => (m.id === updated.id ? updated : m));
      saveResolvedMembers(next);
      return next;
    });
  }

  // Re-parses one member with the edited location text and re-geocodes it.
  // Only the location-related parts are taken from the new result, so direct
  // edits the user already made to availability and budget are kept.
  async function recheckLocation(member: ResolvedMember, newLocation: string) {
    setRecheckingId(member.id);
    setRecheckError(null);
    try {
      const res = await postJson<ParseResponse>("/api/parse", {
        members: [
          {
            id: member.id,
            name: member.name,
            location: newLocation,
            availability: member.availability.raw,
            budget: member.budget.raw,
          },
        ],
        today: localIsoDate(),
      });
      const fresh = res.members[0];
      updateMember({
        ...member,
        location: fresh.location,
        resolution: fresh.resolution,
        confidence: fresh.confidence,
        warnings: fresh.warnings,
        editedByUser: true,
      });
    } catch (error) {
      setRecheckError(error instanceof Error ? error.message : String(error));
    } finally {
      setRecheckingId(null);
    }
  }

  const unresolvedCount = members.filter((m) => !m.resolution.point).length;
  const flaggedCount = members.filter((m) => m.confidence !== "high").length;
  const canConfirm = state.kind === "ready" && members.length > 0 && unresolvedCount === 0 && !recheckingId;

  function confirm() {
    saveConfirmedMembers(members);
    router.push("/results");
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <div className="flex flex-col gap-2">
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← Back to the form
        </Link>
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">Check what Midway understood</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          An AI read everyone&apos;s entries. It can misread things, so please check each person below before we
          look for meeting spots. Fix anything that&apos;s wrong.
        </p>
      </div>

      {state.kind === "loading" && (
        <div role="status" className="rounded-lg border border-zinc-200 p-6 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
          <p className="font-medium">Reading entries and looking up places…</p>
          <p className="mt-1 text-sm text-zinc-500">
            This usually takes a few seconds. The free OpenStreetMap place search allows one lookup per second, so
            bigger groups take a little longer.
          </p>
        </div>
      )}

      {state.kind === "empty" && (
        <p className="text-zinc-500">
          No members found. <Link href="/" className="underline">Go back and fill in the form</Link> first.
        </p>
      )}

      {state.kind === "error" && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-medium">Couldn&apos;t read the entries.</p>
          <p className="text-sm">{state.message}</p>
          <button
            type="button"
            onClick={() => void runParse()}
            className="self-start rounded border border-red-400 px-3 py-1 text-sm hover:bg-red-100 dark:hover:bg-red-900"
          >
            Try again
          </button>
        </div>
      )}

      {state.kind === "ready" && (
        <>
          {state.parser?.startsWith("mock") && <DemoBanner />}
          {(state.status === "partial" || state.status === "failed") && (
            <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
              {state.status === "failed"
                ? "The AI parser wasn't able to interpret these entries, so locations are used as typed and availability and budget are blank. Please check and fill them in."
                : "Some entries couldn't be interpreted by the AI parser. They're marked low confidence below."}
            </p>
          )}
          {flaggedCount > 0 && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {flaggedCount} of {members.length} {members.length === 1 ? "entry needs" : "entries need"} a closer look
              (highlighted).
            </p>
          )}
          {recheckError && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              Re-check failed: {recheckError}
            </p>
          )}

          <div className="flex flex-col gap-4">
            {members.map((m) => (
              <ReviewMemberCard
                key={m.id}
                member={m}
                rechecking={recheckingId === m.id}
                onRecheckLocation={(text) => void recheckLocation(m, text)}
                onChange={updateMember}
              />
            ))}
          </div>

          <div className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <button
              type="button"
              onClick={confirm}
              disabled={!canConfirm}
              className="self-start rounded bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Looks right, find meeting spots
            </button>
            {unresolvedCount > 0 && (
              <p className="text-sm text-red-700 dark:text-red-400">
                {unresolvedCount} {unresolvedCount === 1 ? "member has" : "members have"} no map location yet. Fix
                their location text and re-check to continue.
              </p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
