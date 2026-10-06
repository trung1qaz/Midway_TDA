import { formatDistance, formatDuration, strategyLabel } from "@/lib/format";
import type { CandidatesResponse } from "@/types/api";

// Candidates x members. Rows are in generation order, not ranked.
export default function TravelTable({ data }: { data: CandidatesResponse }) {
  const { members, candidates, matrix } = data;

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-max text-left text-sm">
        <thead className="bg-zinc-50 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              #
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Candidate
            </th>
            {members.map((m) => (
              <th key={m.id} scope="col" className="px-3 py-2 font-medium">
                {m.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {candidates.map((c, j) => (
            <tr key={c.id} className="border-t border-zinc-200 align-top dark:border-zinc-800">
              <td className="px-3 py-2 font-semibold">{j + 1}</td>
              <th scope="row" className="px-3 py-2 font-normal">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{c.name}</span>
                <span className="block text-xs text-zinc-500">
                  {strategyLabel[c.strategy] ?? c.strategy}
                  {c.alsoFoundBy.length > 0 && ` (+${c.alsoFoundBy.length} other seed${c.alsoFoundBy.length > 1 ? "s" : ""})`}
                </span>
              </th>
              {members.map((m, i) => {
                const duration = matrix?.durationsSec[i][j] ?? null;
                const distance = matrix?.distancesM[i][j] ?? null;
                return (
                  <td key={m.id} className="px-3 py-2">
                    {!matrix ? (
                      <span className="text-zinc-400">—</span>
                    ) : duration == null ? (
                      <span className="text-red-700 dark:text-red-400">no route</span>
                    ) : (
                      <>
                        <span className="text-zinc-900 dark:text-zinc-100">{formatDuration(duration)}</span>
                        <span className="block text-xs text-zinc-500">{formatDistance(distance)}</span>
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
