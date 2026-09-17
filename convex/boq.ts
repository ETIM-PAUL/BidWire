"use node";

import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action } from "./_generated/server";
import { structuredCall } from "./lib/llm";

const boqItemSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    spec: { type: "string" },
    quantity: { type: "number" },
    unit: { type: "string" },
    category: { type: "string" },
  },
  required: ["name", "spec", "quantity", "unit", "category"],
  additionalProperties: false,
};

const boqSchema = {
  type: "object",
  properties: {
    items: { type: "array", items: boqItemSchema },
  },
  required: ["items"],
  additionalProperties: false,
};

type BoqItem = {
  name: string;
  spec: string;
  quantity: number;
  unit: string;
  category: string;
};

const BATCH_SIZE = 4;
const BATCH_DELAY_MS = 300;

// Public action: called directly from the client to turn a project's job
// description into a bill of quantities. Ownership is enforced by routing
// through the existing `projects.getProject` query, which throws for anyone
// but the project's owner.
export const generateBoq = action({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(api.projects.getProject, {
      projectId: args.projectId,
    });

    const result = await structuredCall<{ items: BoqItem[] }>({
      schemaName: "bill_of_quantities",
      schema: boqSchema,
      system:
        "You are a construction materials estimator for small contractors. " +
        "Given a job description, location, and currency, produce a bill of " +
        "quantities: a realistic list of 15 to 30 materials needed to complete " +
        "the job. Each item needs a short name, a one-line spec/description, " +
        "an estimated quantity, a unit of measure (e.g. bag, sqm, piece, linear " +
        "meter, box), and a category (e.g. Plumbing, Electrical, Tiling, " +
        "Flooring, Fixtures, Paint, Carpentry). Be concrete and specific to the " +
        "job described, not generic.",
      input:
        `Job: ${project.name}\n` +
        `Description: ${project.jobDescription}\n` +
        `Location: ${project.location}\n` +
        `Currency: ${project.currency}`,
    });

    for (let i = 0; i < result.items.length; i += BATCH_SIZE) {
      const batch = result.items
        .slice(i, i + BATCH_SIZE)
        .map((item, j) => ({ ...item, sortOrder: i + j }));
      await ctx.runMutation(internal.lineItems.insertBatch, {
        projectId: args.projectId,
        items: batch,
      });
      if (i + BATCH_SIZE < result.items.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    await ctx.runMutation(internal.lineItems.markBoqReady, {
      projectId: args.projectId,
    });
    return null;
  },
});
