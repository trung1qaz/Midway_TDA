// Browser-side helper for calling our own route handlers. Surfaces the
// server's `{ error }` message instead of a bare status code.
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't reach the Midway server. Is `npm run dev` still running?");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data.error === "string" ? data.error : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

// The user's local calendar date, so relative dates resolve in their timezone.
export function localIsoDate(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
