import { v } from "convex/values";
import { internalQuery, query } from "./_generated/server";
import { requireProjectOwner } from "./lib/auth";

export const listThreads = query({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      _id: v.id("threads"),
      _creationTime: v.number(),
      supplierId: v.id("suppliers"),
      supplierName: v.string(),
      lastMessageAt: v.number(),
      followUpsSent: v.number(),
      messageCount: v.number(),
      lastMessagePreview: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(200);

    const enriched = await Promise.all(
      threads.map(async (thread) => {
        const supplier = await ctx.db.get(thread.supplierId);
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
          .take(500);
        const last = messages.sort((a, b) => b.receivedAt - a.receivedAt)[0];
        return {
          _id: thread._id,
          _creationTime: thread._creationTime,
          supplierId: thread.supplierId,
          supplierName: supplier?.name ?? "Unknown supplier",
          lastMessageAt: thread.lastMessageAt,
          followUpsSent: thread.followUpsSent,
          messageCount: messages.length,
          lastMessagePreview: (last?.bodyText ?? "").slice(0, 140),
        };
      }),
    );
    return enriched.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  },
});

const messageFields = {
  _id: v.id("messages"),
  _creationTime: v.number(),
  threadId: v.optional(v.id("threads")),
  projectId: v.id("projects"),
  supplierId: v.optional(v.id("suppliers")),
  providerMessageId: v.string(),
  direction: v.union(v.literal("out"), v.literal("in")),
  subject: v.string(),
  bodyText: v.string(),
  attachmentIds: v.array(v.id("_storage")),
  receivedAt: v.number(),
  processed: v.boolean(),
};

export const listMessagesForThread = query({
  args: { threadId: v.id("threads") },
  returns: v.array(v.object(messageFields)),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      throw new Error("Thread not found");
    }
    await requireProjectOwner(ctx, thread.projectId);
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .take(500);
    return messages.sort((a, b) => a.receivedAt - b.receivedAt);
  },
});

// Internal: only called by quoteExtraction.ts's processInboundMessage.
export const getMessageById = internalQuery({
  args: { messageId: v.id("messages") },
  returns: v.union(v.object(messageFields), v.null()),
  handler: async (ctx, args) => {
    return ctx.db.get(args.messageId);
  },
});

// The "Unmatched" bucket: inbound messages from senders that didn't match
// any known supplier.
export const listUnmatchedMessages = query({
  args: { projectId: v.id("projects") },
  returns: v.array(v.object(messageFields)),
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(1000);
    return messages
      .filter((m) => m.supplierId === undefined)
      .sort((a, b) => b.receivedAt - a.receivedAt);
  },
});
