import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireProjectOwner, requireUserId } from "./lib/auth";

const projectStatus = v.union(
  v.literal("draft"),
  v.literal("boq_ready"),
  v.literal("sourcing"),
  v.literal("rfq_sent"),
  v.literal("comparing"),
  v.literal("awarded"),
);

const projectFields = {
  _id: v.id("projects"),
  _creationTime: v.number(),
  ownerId: v.id("users"),
  name: v.string(),
  jobDescription: v.string(),
  location: v.string(),
  currency: v.string(),
  status: projectStatus,
  inboxId: v.optional(v.string()),
  inboxAddress: v.optional(v.string()),
  attachmentIds: v.optional(v.array(v.id("_storage"))),
  createdAt: v.number(),
};

export const createProject = mutation({
  args: {
    name: v.string(),
    jobDescription: v.string(),
    location: v.string(),
    currency: v.string(),
    attachmentIds: v.optional(v.array(v.id("_storage"))),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const projectId = await ctx.db.insert("projects", {
      ownerId: userId,
      name: args.name,
      jobDescription: args.jobDescription,
      location: args.location,
      currency: args.currency,
      attachmentIds: args.attachmentIds,
      status: "draft",
      createdAt: Date.now(),
    });
    await ctx.db.insert("events", {
      projectId,
      type: "project_created",
      payload: { name: args.name },
      createdAt: Date.now(),
    });
    return projectId;
  },
});

export const listMyProjects = query({
  args: {},
  returns: v.array(v.object(projectFields)),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .take(500);
  },
});

export const getProject = query({
  args: { projectId: v.id("projects") },
  returns: v.object(projectFields),
  handler: async (ctx, args) => {
    return requireProjectOwner(ctx, args.projectId);
  },
});

// Internal: only called by inbox.ts's provisionInbox action, which has
// already verified ownership via getProject before calling this.
export const setInbox = internalMutation({
  args: {
    projectId: v.id("projects"),
    inboxId: v.string(),
    inboxAddress: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      inboxId: args.inboxId,
      inboxAddress: args.inboxAddress,
      status: "sourcing",
    });
    await ctx.db.insert("events", {
      projectId: args.projectId,
      type: "inbox_provisioned",
      payload: { inboxAddress: args.inboxAddress },
      createdAt: Date.now(),
    });
    return null;
  },
});
