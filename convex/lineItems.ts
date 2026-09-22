import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireLineItemOwner, requireProjectOwner } from "./lib/auth";

const lineItemFields = {
  _id: v.id("lineItems"),
  _creationTime: v.number(),
  projectId: v.id("projects"),
  name: v.string(),
  spec: v.string(),
  quantity: v.number(),
  unit: v.string(),
  category: v.string(),
  sortOrder: v.number(),
};

export const listLineItems = query({
  args: { projectId: v.id("projects") },
  returns: v.array(v.object(lineItemFields)),
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const items = await ctx.db
      .query("lineItems")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(1000);
    return items.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const listLineItemsInternal = internalQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(v.object(lineItemFields)),
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("lineItems")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(1000);
    return items.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const createLineItem = mutation({
  args: { projectId: v.id("projects") },
  returns: v.id("lineItems"),
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const project = await ctx.db.get(args.projectId);
    if (project?.status === "awarded") {
      throw new Error("Materials are locked after award.");
    }
    const existing = await ctx.db
      .query("lineItems")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(1000);
    const maxSortOrder = existing.reduce((max, i) => Math.max(max, i.sortOrder), -1);
    return ctx.db.insert("lineItems", {
      projectId: args.projectId,
      name: "",
      spec: "",
      quantity: 1,
      unit: "",
      category: "",
      sortOrder: maxSortOrder + 1,
    });
  },
});

export const updateLineItem = mutation({
  args: {
    lineItemId: v.id("lineItems"),
    name: v.optional(v.string()),
    spec: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await requireLineItemOwner(ctx, args.lineItemId);
    const project = await ctx.db.get(item.projectId);
    if (project?.status === "awarded") {
      throw new Error("Materials are locked after award.");
    }
    const patch: Partial<{
      name: string;
      spec: string;
      quantity: number;
      unit: string;
      category: string;
    }> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.spec !== undefined) patch.spec = args.spec;
    if (args.quantity !== undefined) patch.quantity = args.quantity;
    if (args.unit !== undefined) patch.unit = args.unit;
    if (args.category !== undefined) patch.category = args.category;
    await ctx.db.patch(args.lineItemId, patch);
    return null;
  },
});

export const deleteLineItem = mutation({
  args: { lineItemId: v.id("lineItems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await requireLineItemOwner(ctx, args.lineItemId);
    const project = await ctx.db.get(item.projectId);
    if (project?.status === "awarded") {
      throw new Error("Materials are locked after award.");
    }
    await ctx.db.delete(args.lineItemId);
    return null;
  },
});

export const moveLineItem = mutation({
  args: {
    lineItemId: v.id("lineItems"),
    direction: v.union(v.literal("up"), v.literal("down")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await requireLineItemOwner(ctx, args.lineItemId);
    const project = await ctx.db.get(item.projectId);
    if (project?.status === "awarded") {
      throw new Error("Materials are locked after award.");
    }
    const siblings = await ctx.db
      .query("lineItems")
      .withIndex("by_project", (q) => q.eq("projectId", item.projectId))
      .take(1000);
    const sorted = siblings.sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((s) => s._id === item._id);
    const swapIdx = args.direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) {
      return null;
    }
    const other = sorted[swapIdx];
    await ctx.db.patch(item._id, { sortOrder: other.sortOrder });
    await ctx.db.patch(other._id, { sortOrder: item.sortOrder });
    return null;
  },
});

export const insertBatch = internalMutation({
  args: {
    projectId: v.id("projects"),
    items: v.array(
      v.object({
        name: v.string(),
        spec: v.string(),
        quantity: v.number(),
        unit: v.string(),
        category: v.string(),
        sortOrder: v.number(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const item of args.items) {
      await ctx.db.insert("lineItems", { projectId: args.projectId, ...item });
    }
    return null;
  },
});

export const markBoqReady = internalMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, { status: "boq_ready" });
    await ctx.db.insert("events", {
      projectId: args.projectId,
      type: "boq_generated",
      payload: {},
      createdAt: Date.now(),
    });
    return null;
  },
});
