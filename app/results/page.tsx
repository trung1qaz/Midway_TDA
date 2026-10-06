"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import ResultsMapLoader from "@/components/results/ResultsMapLoader";
import TravelTable from "@/components/results/TravelTable";
import { postJson } from "@/lib/api/client";
import { strategyLabel } from "@/lib/format";
import { loadConfirmedMembers } from "@/lib/memberStorage";
import type { CandidatesResponse } from "@/types/api";

type State =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: CandidatesResponse };

export default function ResultsPage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  // Avoids a duplicate (rate-limited) request from Strict Mode's double effect.
  const started = useRef(false);

  const load = useCallback(async () => {
    const confirmed = loadConfirmedMembers().filter((m) => m.resolution.point);
    if (confirmed.length === 0) {
      setState({ kind: "empty" });
      return;
    }
    setState({ kind: "loading" });
    try {
      const data = await postJson<CandidatesResponse>("/api/candidates", {
        members: confirmed.map((m) => ({ id: m.id, name: m.name, point: m.resolution.point })),
      });
      setState({ kind: "ready", data });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // sessionStorage is browser-only, so loading starts after mount.
    void Promise.resolve().then(load);
  }, [load]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-12">
      <div className="flex flex-col gap-2">
        <Link href="/review" className="text-sm text-zinc-500 hover:underline">
          ← Back to review
        </Link>
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">Possible meeting spots</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Candidate towns near the middle of the group, with everyone&apos;s drive to each one. They are listed in the
          order they were generated and are <strong>not ranked</strong> yet; scoring arrives in a later checkpoint.
        </p>
      </div>

      {state.kind === "loading" && (
        <div role="status" className="rounded-lg border border-zinc-200 p-6 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
          <p className="font-medium">Finding towns and calculating drive times…</p>
          <p className="mt-1 text-sm text-zinc-500">
            This can take around 10 seconds. Midway checks several candidate points against the free OpenStreetMap
            place search, which allows one lookup per second.
          </p>
        </div>
      )}

      {state.kind === "empty" && (
        <p className="text-zinc-500">
          No confirmed members yet. <Link href="/" className="underline">Start from the form</Link> and confirm the
          review step.
        </p>
      )}

      {state.kind === "error" && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-medium">Couldn&apos;t find meeting spots.</p>
          <p className="text-sm">{state.message}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="self-start rounded border border-red-400 px-3 py-1 text-sm hover:bg-red-100 dark:hover:bg-red-900"
          >
            Try again
          </button>
        </div>
      )}

      {state.kind === "ready" && <Results data={state.data} />}
    </main>
  );
}

function Results({ data }: { data: CandidatesResponse }) {
  return (
    <>
      <ResultsMapLoader data={data} />
      <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-600 dark:text-zinc-400">
        <span className="flex items-center gap-2">
          <span className="midway-pin midway-pin-member legend">
            <span>A</span>
          </span>
          Member
        </span>
        <span className="flex items-center gap-2">
          <span className="midway-pin midway-pin-candidate legend">
            <span>1</span>
          </span>
          Candidate (click a pin for drive times)
        </span>
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Found {data.candidates.length} candidate {data.candidates.length === 1 ? "town" : "towns"} from{" "}
        {data.seedsTried} seed {data.seedsTried === 1 ? "point" : "points"}
        {data.droppedSeeds.length > 0 &&
          ` (${data.droppedSeeds.length} had no town nearby: ${data.droppedSeeds.join(", ")})`}
        . Seeds that landed on the same town were merged.
        {data.candidates.length < 3 && " That's fewer than usual, likely because the group is close together."}
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Drive time and distance</h2>
        <p className="text-sm text-zinc-500">
          Free-flow driving estimates from OSRM (OpenStreetMap road data), with no live traffic.
        </p>
        {data.matrixError && (
          <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            Travel times are unavailable right now: {data.matrixError}
          </p>
        )}
        <TravelTable data={data} />
      </section>

      <details className="text-sm text-zinc-600 dark:text-zinc-400">
        <summary className="cursor-pointer">How were these candidates chosen?</summary>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
          {data.candidates.map((c, j) => (
            <li key={c.id}>
              {j + 1}. {c.name}: snapped from the <em>{c.seedLabel}</em> seed ({strategyLabel[c.strategy] ?? c.strategy}
              ){c.alsoFoundBy.length > 0 && `; also reached from ${c.alsoFoundBy.join(", ")}`}.
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
