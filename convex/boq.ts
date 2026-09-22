"use node";

import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action } from "./_generated/server";
import { structuredCall } from "./lib/llm";

const boqItemSchema = { type: "object", properties: { name: { type: "string" }, spec: { type: "string" }, quantity: { type: "number" }, unit: { type: "string" }, category: { type: "string" } }, required: ["name", "spec", "quantity", "unit", "category"], additionalProperties: false };
const boqSchema = { type: "object", properties: { items: { type: "array", items: boqItemSchema } }, required: ["items"], additionalProperties: false };
type BoqItem = { name: string; spec: string; quantity: number; unit: string; category: string };
const BATCH_SIZE = 4; const BATCH_DELAY_MS = 300;

export const generateBoq = action({
  args: { projectId: v.id("projects") }, returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(api.projects.getProject, { projectId: args.projectId });
    const result = await structuredCall<{ items: BoqItem[] }>({
      schemaName: "bill_of_quantities", schema: boqSchema,
      system: "You are a procurement estimator, not a generic construction estimator. Infer the actual project type from the job description and generate only materials, equipment, services and supplies required for that specific project. Do not assume construction, building materials, plumbing or electrical work unless the description explicitly requires them. For a bakery, use relevant bakery production equipment and supplies; for a restaurant, use restaurant equipment; for an office, use office procurement; for a bathroom renovation, use bathroom materials. Produce 15 to 30 concrete items when the description supports that many, but do not invent unrelated items to reach a count. Each item needs a short name, one-line spec, estimated quantity, unit, and a project-specific category.",
      input: `Project: ${project.name}\nJob description: ${project.jobDescription}\nLocation: ${project.location}\nCurrency: ${project.currency}`,
    });
    for (let i = 0; i < result.items.length; i += BATCH_SIZE) {
      const batch = result.items.slice(i, i + BATCH_SIZE).map((item, j) => ({ ...item, sortOrder: i + j }));
      await ctx.runMutation(internal.lineItems.insertBatch, { projectId: args.projectId, items: batch });
      if (i + BATCH_SIZE < result.items.length) await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
    await ctx.runMutation(internal.lineItems.markBoqReady, { projectId: args.projectId });
    return null;
  },
});
