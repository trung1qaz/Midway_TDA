import { GoogleGenAI } from "@google/genai";
import type { Member } from "@/types/member";
import { parserResponseJsonSchema } from "./jsonSchema";
import { buildUserContent, SYSTEM_INSTRUCTION } from "./prompt";
import type { MemberParser } from "./types";

// Free-tier Gemini often answers 503 "high demand" (and occasionally 429)
// for a few seconds at a time, so transient errors get a couple of retries
// with backoff before the caller falls back.
const RETRY_DELAYS_MS = [1500, 4000];

export function isTransientGeminiError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /"code":\s*(503|429)|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand/i.test(message);
}

// Gemini via the official SDK, using JSON-schema structured output.
// One request per submission (all members batched) to stay well inside
// free-tier rate limits.
export function createGeminiParser(opts: { apiKey: string; model: string }): MemberParser {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });

  async function callOnce(members: Member[], today: string): Promise<unknown> {
    const response = await ai.models.generateContent({
      model: opts.model,
      contents: buildUserContent(members, today),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseJsonSchema: parserResponseJsonSchema,
      },
    });
    const text = response.text;
    if (!text) throw new Error("Gemini returned an empty response");
    return JSON.parse(text);
  }

  return {
    name: `gemini:${opts.model}`,
    async parse(members: Member[], today: string): Promise<unknown> {
      for (let attempt = 0; ; attempt++) {
        try {
          return await callOnce(members, today);
        } catch (error) {
          if (attempt >= RETRY_DELAYS_MS.length || !isTransientGeminiError(error)) throw error;
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
        }
      }
    },
  };
}
