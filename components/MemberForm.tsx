"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { newMemberId, saveMembers } from "@/lib/memberStorage";
import type { Member } from "@/types/member";

function emptyMember(): Member {
  return { id: newMemberId(), name: "", location: "", availability: "", budget: "" };
}

export default function MemberForm() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>(() => [emptyMember()]);

  function updateMember(
    index: number,
    field: Exclude<keyof Member, "id">,
    value: string
  ) {
    setMembers((prev) =>
      prev.map((member, i) =>
        i === index ? { ...member, [field]: value } : member
      )
    );
  }

  function addMember() {
    setMembers((prev) => [...prev, emptyMember()]);
  }

  function removeMember(index: number) {
    setMembers((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const submittable = members.filter(
      (m) => m.name.trim() && m.location.trim()
    );
    saveMembers(submittable);
    router.push("/results");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {members.map((member, index) => (
        <div
          key={member.id}
          className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
              Member {index + 1}
            </h3>
            {members.length > 1 && (
              <button
                type="button"
                onClick={() => removeMember(index)}
                className="text-sm text-red-600 hover:underline dark:text-red-400"
              >
                Remove
              </button>
            )}
          </div>

          <label className="flex flex-col gap-1 text-sm">
            Name
            <input
              type="text"
              required
              value={member.name}
              onChange={(e) => updateMember(index, "name", e.target.value)}
              className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
              placeholder="Jane Doe"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Location
            <input
              type="text"
              required
              value={member.location}
              onChange={(e) =>
                updateMember(index, "location", e.target.value)
              }
              className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
              placeholder="somewhere near downtown Chicago"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Availability
            <input
              type="text"
              value={member.availability}
              onChange={(e) =>
                updateMember(index, "availability", e.target.value)
              }
              className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
              placeholder="weekday evenings"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Budget
            <input
              type="text"
              value={member.budget}
              onChange={(e) => updateMember(index, "budget", e.target.value)}
              className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
              placeholder="$20 or flexible"
            />
          </label>
        </div>
      ))}

      <button
        type="button"
        onClick={addMember}
        className="self-start rounded border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        + Add member
      </button>

      <button
        type="submit"
        className="self-start rounded bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        Find a meeting point
      </button>
    </form>
  );
}
