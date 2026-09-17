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
      type: v.string(),
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
