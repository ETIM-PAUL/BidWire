import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";\nimport { api, internal } from "./_generated/api";
import { requireProjectOwner, requireUserId } from "./lib/auth";

const projectStatus = v.union(
  v.literal("draft"),
  v.literal("boq_ready"),
  v.literal("sourcing"),
  v.literal("rfq_sent"),
  v.literal("comparing"),
  v.literal("awarded"),
  v.literal("cancelled"),
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
  autoApproveFollowUps: v.optional(v.boolean()),
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
      createdAt: Date.now(),\n      jobDescriptionCreatedAt: Date.now(),
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

// Internal: only called by followupCheck.ts's checkFollowUp and
// expiry.ts's scanExpiringQuotes.
export const getProjectById = internalQuery({
  args: { projectId: v.id("projects") },
  returns: v.union(v.object(projectFields), v.null()),
  handler: async (ctx, args) => {
    return ctx.db.get(args.projectId);
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

export const createSampleBathroomProject = mutation({
  args: {},
  returns: v.id("projects"),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db.query("projects").withIndex("by_owner", q => q.eq("ownerId", userId)).take(50);
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      ownerId: userId,
      name: "Sample Bathroom Renovation",
      jobDescription: "Full bathroom renovation: replace floor and wall tiles, install a close-coupled toilet, vanity basin, shower mixer and screen, new floor drain, plumbing fittings, waterproofing and repainting. Mid-range finish for a typical residential bathroom.",
      location: "Port Harcourt",
      currency: "NGN",
      status: "draft",
      createdAt: now,
    });
    await ctx.db.insert("events", { projectId, type: "project_created", payload: { name: "Sample Bathroom Renovation", sample: true }, createdAt: now });
    return projectId;
  },
});

export const launchSampleJob = action({
  args: {},
  returns: v.id("projects"),
  handler: async (ctx) => {
    const projectId = await ctx.runMutation(api.projects.createSampleBathroomProject, {});
    await ctx.runAction(api.boq.generateBoq, { projectId });
    await ctx.runMutation(internal.suppliers.ensureDemoSuppliers, { projectId });
    return projectId;
  },
});
