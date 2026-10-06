import { z } from "zod";

// Request-body validation shared by the API route handlers.

export const MAX_MEMBERS = 20;

export const memberInputSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  location: z.string().trim().min(1).max(300),
  availability: z.string().max(300).default(""),
  budget: z.string().max(300).default(""),
});

export const parseRequestSchema = z.object({
  members: z.array(memberInputSchema).min(1).max(MAX_MEMBERS),
  // The browser's local date, so "next Saturday" resolves in the user's
  // timezone rather than the server's.
  today: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const candidatesRequestSchema = z.object({
  members: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        name: z.string().max(100),
        point: z.object({
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
        }),
      })
    )
    .min(1)
    .max(MAX_MEMBERS),
});

export function jsonError(message: string, status: number, details?: unknown): Response {
  return Response.json({ error: message, ...(details ? { details } : {}) }, { status });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
