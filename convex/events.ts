import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireProjectOwner } from "./lib/auth";

export const listEvents = query({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      _id: v.id("events"),
      _creationTime: v.number(),
      projectId: v.id("projects"),
      type: v.union(v.literal("project_created"), v.literal("inbox_provisioned"), v.literal("message_received"), v.literal("message_unmatched"), v.literal("message_classified"), v.literal("project_awarded"), v.literal("award_send_blocked"), v.literal("po_sent"), v.literal("decline_sent"), v.literal("award_draft_created"), v.literal("boq_ready"), v.literal("rfq_sent"), v.literal("quote_received"), v.literal("project_cancelled"), v.literal("follow_up_sent"), v.literal("supplier_selected"), v.literal("draft_created")),
      payload: v.any(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return ctx.db
      .query("events")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(50);
  },
});
