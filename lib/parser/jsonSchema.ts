// JSON Schema sent to Gemini as `responseJsonSchema`. Hand-written instead of
// generated from zod so it stays inside the keyword subset Gemini supports
// (type, enum, items, properties, required, minItems, description). The zod
// schema in schema.ts is still the source of truth and is applied afterwards.

const nullableString = (description: string) => ({
  type: ["string", "null"],
  description,
});

export const parserResponseJsonSchema = {
  type: "object",
  properties: {
    members: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Copy the member id exactly." },
          location: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["point", "area", "between"] },
              anchors: {
                type: "array",
                items: { type: "string" },
                minItems: 1,
                description: "Geocodable place strings; 2+ for between.",
              },
              interpretation: { type: "string" },
            },
            required: ["kind", "anchors", "interpretation"],
          },
          availability: {
            type: "object",
            properties: {
              windows: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    days: {
                      type: ["array", "null"],
                      items: {
                        type: "string",
                        enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
                      },
                    },
                    date: nullableString("YYYY-MM-DD if a specific day"),
                    start: nullableString("HH:MM, 24h"),
                    end: nullableString("HH:MM, 24h"),
                    label: { type: "string" },
                  },
                  required: ["days", "date", "start", "end", "label"],
                },
              },
            },
            required: ["windows"],
          },
          budget: {
            type: "object",
            properties: {
              maxPerPerson: { type: ["number", "null"] },
              currency: { type: "string" },
              level: {
                anyOf: [
                  { type: "string", enum: ["low", "medium", "high"] },
                  { type: "null" },
                ],
              },
            },
            required: ["maxPerPerson", "currency", "level"],
          },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          warnings: { type: "array", items: { type: "string" } },
        },
        required: [
          "id",
          "location",
          "availability",
          "budget",
          "confidence",
          "warnings",
        ],
      },
    },
  },
  required: ["members"],
} as const;
