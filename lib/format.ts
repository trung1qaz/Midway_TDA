// Display helpers for travel data. Miles first because the app targets US
// groups (budgets default to USD); km is shown alongside.

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return "no route";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatDistance(meters: number | null): string {
  if (meters == null) return "no route";
  const miles = meters / 1609.344;
  const km = meters / 1000;
  const fmt = (n: number) => (n < 10 ? n.toFixed(1) : Math.round(n).toString());
  return `${fmt(miles)} mi (${fmt(km)} km)`;
}

export const strategyLabel: Record<string, string> = {
  "single-member": "Member's own location",
  "same-place": "Shared location",
  "great-circle": "Along the line between members",
  "perpendicular-offset": "Beside the midpoint",
  "spherical-centroid": "Spherical centroid",
  "geometric-median": "Geometric median (least total distance)",
  minimax: "Minimax center (smallest longest trip)",
  ring: "Ring around the centroid",
};
