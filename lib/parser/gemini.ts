import { GoogleGenAI } from "@google/genai";
import type { Member } from "@/types/member";
import { parserResponseJsonSchema } from "./jsonSchema";
import { buildUserContent, SYSTEM_INSTRUCTION } from "./prompt";
import type { MemberParser } from "./types";

// Gemini via the official SDK, using JSON-schema structured output.
// One request per submission (all members batched) to stay well inside
// free-tier rate limits.
export function createGeminiParser(opts: { apiKey: string; model: string }): MemberParser {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });

  return {
    name: `gemini:${opts.model}`,
    async parse(members: Member[], today: string): Promise<unknown> {
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
    },
  };
}
