"use node";

import OpenAI from "openai";
import { v } from "convex/values";
import { internalAction } from "../_generated/server";

const DEFAULT_MODEL = "gpt-4o-mini";

// Per the build plan: Luna (DEFAULT_MODEL) for extraction/classification,
// this mid-tier model only for customer-facing drafts (RFQs, replies to
// supplier questions, follow-ups, negotiation, award/decline emails).
export const DRAFT_MODEL = "gpt-4o-mini";

let client: OpenAI | undefined;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

export type StructuredCallArgs = {
  model?: string;
  schemaName: string;
  schema: Record<string, unknown>;
  system: string;
  input: string;
};

/**
 * The only sanctioned entry point for calling OpenAI. Always requests a
 * strict JSON-schema structured output — callers never parse free text.
 */
export async function structuredCall<T>({
  model = DEFAULT_MODEL,
  schemaName,
  schema,
  system,
  input,
}: StructuredCallArgs): Promise<T> {
  const response = await getClient().chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: input },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: schemaName,
        schema,
        strict: true,
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("structuredCall: empty response from OpenAI");
  }
  return JSON.parse(content) as T;
}

const smokeTestSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    message: { type: "string" },
  },
  required: ["ok", "message"],
  additionalProperties: false,
};

// Internal, not public: this hits a paid OpenAI call and is only meant to be
// triggered by a developer via `npx convex run lib/llm:smokeTest`, never by a client.
export const smokeTest = internalAction({
  args: { note: v.optional(v.string()) },
  returns: v.object({ ok: v.boolean(), message: v.string() }),
  handler: async (_ctx, args) => {
    return structuredCall<{ ok: boolean; message: string }>({
      schemaName: "smoke_test",
      schema: smokeTestSchema,
      system:
        "You are a health check for an LLM wrapper. Respond with ok=true and a short one-sentence message confirming structured output works.",
      input: args.note ?? "Confirm the structured output pipeline is working.",
    });
  },
});
