"use client";

import { useState } from "react";
import type {
  AvailabilityWindow,
  BudgetLevel,
  Confidence,
  ResolvedMember,
  Weekday,
} from "@/types/parsed";
import { WEEKDAYS } from "@/types/parsed";

const inputClass =
  "rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

const confidenceStyles: Record<Confidence, string> = {
  high: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  medium: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  low: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

const cardBorder: Record<Confidence, string> = {
  high: "border-zinc-200 dark:border-zinc-800",
  medium: "border-amber-400 dark:border-amber-600",
  low: "border-red-400 dark:border-red-600",
};

const kindLabel = { point: "Specific place", area: "Broad area", between: "Between places" };

const dayShort: Record<Weekday, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

interface Props {
  member: ResolvedMember;
  rechecking: boolean;
  onRecheckLocation: (newLocation: string) => void;
  onChange: (updated: ResolvedMember) => void;
}

export default function ReviewMemberCard({ member, rechecking, onRecheckLocation, onChange }: Props) {
  const [locationDraft, setLocationDraft] = useState(member.location.raw);
  const { resolution } = member;

  function updateWindows(windows: AvailabilityWindow[]) {
    onChange({ ...member, availability: { ...member.availability, windows }, editedByUser: true });
  }

  function updateBudget(patch: Partial<ResolvedMember["budget"]>) {
    onChange({ ...member, budget: { ...member.budget, ...patch }, editedByUser: true });
  }

  return (
    <article className={`flex flex-col gap-4 rounded-lg border-2 p-4 ${cardBorder[member.confidence]}`}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">{member.name}</h2>
        <div className="flex items-center gap-2">
          {member.editedByUser && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              Edited by you
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${confidenceStyles[member.confidence]}`}>
            {member.confidence} confidence
          </span>
        </div>
      </header>

      {member.warnings.length > 0 && (
        <ul
          className={`flex flex-col gap-1 rounded-md p-3 text-sm ${
            member.confidence === "high"
              ? "bg-zinc-50 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              : "bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
          }`}
        >
          {member.warnings.map((w, i) => (
            <li key={i}>⚠ {w}</li>
          ))}
        </ul>
      )}

      {/* Location */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Location</h3>
        <p className="text-sm text-zinc-500">
          They wrote: <q className="text-zinc-800 dark:text-zinc-200">{member.location.raw}</q>
        </p>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          <span className="mr-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
            {kindLabel[member.location.kind]}
          </span>
          {member.location.interpretation}
        </p>
        <ul className="flex flex-col gap-1 text-sm">
          {resolution.anchors.map((a) => (
            <li key={`${a.osmType}/${a.osmId}`} className="text-zinc-700 dark:text-zinc-300">
              📍 <span className="text-zinc-500">{a.query} →</span> {a.displayName}
            </li>
          ))}
          {resolution.unresolved.map((q) => (
            <li key={q} className="text-red-700 dark:text-red-400">
              ✕ Not found: {q}
            </li>
          ))}
        </ul>
        {member.location.kind === "between" && resolution.point && resolution.anchors.length > 1 && (
          <p className="text-xs text-zinc-500">
            Using the midpoint: {resolution.point.lat.toFixed(3)}, {resolution.point.lng.toFixed(3)}
          </p>
        )}
        {!resolution.point && (
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            No map location yet. Edit the text below and re-check.
          </p>
        )}
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (locationDraft.trim()) onRecheckLocation(locationDraft.trim());
          }}
        >
          <input
            aria-label={`Location text for ${member.name}`}
            className={`${inputClass} min-w-0 flex-1`}
            value={locationDraft}
            onChange={(e) => setLocationDraft(e.target.value)}
          />
          <button
            type="submit"
            disabled={rechecking || !locationDraft.trim()}
            className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {rechecking ? "Re-checking…" : "Re-check location"}
          </button>
        </form>
      </section>

      {/* Availability */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Availability</h3>
        <p className="text-sm text-zinc-500">
          They wrote:{" "}
          {member.availability.raw ? (
            <q className="text-zinc-800 dark:text-zinc-200">{member.availability.raw}</q>
          ) : (
            <em>nothing</em>
          )}
        </p>
        {member.availability.windows.length === 0 && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No time windows (treated as unknown).</p>
        )}
        {member.availability.windows.map((w, i) => (
          <WindowEditor
            key={i}
            window={w}
            onChange={(next) =>
              updateWindows(member.availability.windows.map((old, j) => (j === i ? next : old)))
            }
            onRemove={() => updateWindows(member.availability.windows.filter((_, j) => j !== i))}
          />
        ))}
        <button
          type="button"
          className="self-start text-sm text-zinc-700 underline dark:text-zinc-300"
          onClick={() =>
            updateWindows([
              ...member.availability.windows,
              { days: null, date: null, start: null, end: null, label: "New time window" },
            ])
          }
        >
          + Add time window
        </button>
      </section>

      {/* Budget */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Budget</h3>
        <p className="text-sm text-zinc-500">
          They wrote:{" "}
          {member.budget.raw ? (
            <q className="text-zinc-800 dark:text-zinc-200">{member.budget.raw}</q>
          ) : (
            <em>nothing</em>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1">
            Max per person
            <input
              type="number"
              min={0}
              className={`${inputClass} w-24`}
              value={member.budget.maxPerPerson ?? ""}
              placeholder="none"
              onChange={(e) =>
                updateBudget({ maxPerPerson: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })
              }
            />
          </label>
          <label className="flex items-center gap-1">
            Currency
            <input
              className={`${inputClass} w-16 uppercase`}
              value={member.budget.currency}
              maxLength={3}
              onChange={(e) => updateBudget({ currency: e.target.value.toUpperCase() || "USD" })}
            />
          </label>
          <label className="flex items-center gap-1">
            Level
            <select
              className={inputClass}
              value={member.budget.level ?? ""}
              onChange={(e) => updateBudget({ level: (e.target.value || null) as BudgetLevel | null })}
            >
              <option value="">Not stated</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>
      </section>
    </article>
  );
}

function WindowEditor({
  window: w,
  onChange,
  onRemove,
}: {
  window: AvailabilityWindow;
  onChange: (w: AvailabilityWindow) => void;
  onRemove: () => void;
}) {
  function toggleDay(day: Weekday) {
    const current = w.days ?? [];
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    // Keep weekday order stable regardless of click order.
    const ordered = WEEKDAYS.filter((d) => next.includes(d));
    onChange({ ...w, days: ordered.length ? ordered : null });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md bg-zinc-50 p-3 dark:bg-zinc-900">
      <div className="flex items-center gap-2">
        <input
          aria-label="Window label"
          className={`${inputClass} min-w-0 flex-1`}
          value={w.label}
          onChange={(e) => onChange({ ...w, label: e.target.value })}
        />
        <button type="button" onClick={onRemove} className="text-xs text-red-600 hover:underline dark:text-red-400">
          Remove
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {WEEKDAYS.map((day) => {
          const on = w.days?.includes(day) ?? false;
          return (
            <button
              key={day}
              type="button"
              aria-pressed={on}
              onClick={() => toggleDay(day)}
              className={`rounded px-2 py-0.5 text-xs ${
                on
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
              }`}
            >
              {dayShort[day]}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1">
          Date
          <input
            type="date"
            className={inputClass}
            value={w.date ?? ""}
            onChange={(e) => onChange({ ...w, date: e.target.value || null })}
          />
        </label>
        <label className="flex items-center gap-1">
          From
          <input
            type="time"
            className={inputClass}
            value={w.start ?? ""}
            onChange={(e) => onChange({ ...w, start: e.target.value || null })}
          />
        </label>
        <label className="flex items-center gap-1">
          To
          <input
            type="time"
            className={inputClass}
            value={w.end ?? ""}
            onChange={(e) => onChange({ ...w, end: e.target.value || null })}
          />
        </label>
      </div>
    </div>
  );
}
