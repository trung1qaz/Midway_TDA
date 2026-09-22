"use client";

import { useEffect, useState } from "react";
import { loadMembers } from "@/lib/memberStorage";
import type { Member } from "@/types/member";

export default function ResultsPage() {
  const [members, setMembers] = useState<Member[]>([]);

  // sessionStorage is only available client-side, so this page reads it
  // after mount rather than during render.
  useEffect(() => {
    setMembers(loadMembers());
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
          Results will appear here
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Midpoint generation, scoring, and maps come later. For now, here is
          the data that was submitted.
        </p>
      </div>

      {members.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-500">
          No members found. Go back and submit the form first.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {members.map((member, index) => (
            <li
              key={index}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                {member.name}
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Location: {member.location}{" "}
                <span className="italic text-zinc-400 dark:text-zinc-500">
                  (geocoding will run here in a future week)
                </span>
              </p>
              {member.availability && (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Availability: {member.availability}
                </p>
              )}
              {member.budget && (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Budget: {member.budget}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
