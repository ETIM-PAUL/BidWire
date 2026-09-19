import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";

function getStringField(obj: unknown, key: string): string | undefined {
  if (obj && typeof obj === "object" && key in obj) {
    const value = (obj as Record<string, unknown>)[key];
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

function getArrayField(obj: unknown, key: string): unknown[] | undefined {
  if (obj && typeof obj === "object" && key in obj) {
    const value = (obj as Record<string, unknown>)[key];
    return Array.isArray(value) ? value : undefined;
  }
  return undefined;
}

type ParsedAttachment = { attachmentId: string; filename: string; contentType?: string };

function parseAttachments(message: unknown): ParsedAttachment[] {
  const raw = getArrayField(message, "attachments") ?? [];
  const result: ParsedAttachment[] = [];
  for (const item of raw) {
    const attachmentId = getStringField(item, "attachment_id");
    if (!attachmentId) continue;
    result.push({
      attachmentId,
      filename: getStringField(item, "filename") ?? "attachment",
      contentType: getStringField(item, "content_type"),
    });
  }
  return result;
}

// Called by the AgentMail component's webhook dispatcher (wired in
// convex/http.ts) exactly once per unique event, already Svix-verified and
// deduped by the component itself. We ALSO dedupe on our own
// providerMessageId before doing any work, per the build plan's own
// non-negotiable rule: every webhook is idempotent, checked before any
// side effect - defense in depth, not trusting a third party's guarantee
// alone for something this easy to verify ourselves.
export const onMessageReceived = internalMutation({
  args: { message: v.any(), thread: v.any(), eventId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const providerMessageId = getStringField(args.message, "message_id");
    const inboxId = getStringField(args.message, "inbox_id");
    if (!providerMessageId || !inboxId) {
      // Don't drop this silently: if AgentMail's real payload shape ever
      // differs from what we expect here, this is the only trace of it.
      console.error(
        "onMessageReceived: couldn't parse message_id/inbox_id from payload",
        JSON.stringify(args.message).slice(0, 2000),
      );
      return null;
    }

    const existing = await ctx.db
      .query("messages")
      .withIndex("by_provider_message_id", (q) => q.eq("providerMessageId", providerMessageId))
      .unique();
    if (existing) {
      return null;
    }

    const project = await ctx.db
      .query("projects")
      .withIndex("by_inbox_id", (q) => q.eq("inboxId", inboxId))
      .unique();
    if (!project) {
      console.error(`onMessageReceived: no project owns inbox ${inboxId}`);
      return null;
    }

    const providerThreadId = getStringField(args.message, "thread_id");
    const fromAddress = getStringField(args.message, "from")?.trim().toLowerCase();
    const subject = getStringField(args.message, "subject") ?? "";
    const bodyText =
      getStringField(args.message, "text") ?? getStringField(args.message, "html") ?? "";
    const timestampStr = getStringField(args.message, "timestamp");
    const parsedTimestamp = timestampStr ? Date.parse(timestampStr) : NaN;
    const receivedAt = Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now();

    let threadId: Id<"threads"> | undefined;
    let supplierId: Id<"suppliers"> | undefined;

    // 1) Match by AgentMail's own thread ID, if we've seen this thread before.
    if (providerThreadId) {
      const thread = await ctx.db
        .query("threads")
        .withIndex("by_provider_thread_id", (q) => q.eq("providerThreadId", providerThreadId))
        .unique();
      if (thread && thread.projectId === project._id) {
        threadId = thread._id;
        supplierId = thread.supplierId;
      }
    }

    // 2) Fall back to matching by sender address against known suppliers.
    if (!threadId && fromAddress) {
      const suppliers = await ctx.db
        .query("suppliers")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .take(500);
      const supplier = suppliers.find((s) => s.email?.trim().toLowerCase() === fromAddress);
      if (supplier) {
        supplierId = supplier._id;
        const existingThread = await ctx.db
          .query("threads")
          .withIndex("by_supplier", (q) => q.eq("supplierId", supplier._id))
          .first();
        if (existingThread) {
          threadId = existingThread._id;
          // The thread was seeded with a placeholder providerThreadId when we
          // sent the RFQ (AgentMail's real thread ID isn't known until its
          // first reply). Reconcile it now so later replies match by step 1.
          if (providerThreadId && existingThread.providerThreadId !== providerThreadId) {
            await ctx.db.patch(existingThread._id, { providerThreadId });
          }
        } else if (providerThreadId) {
          threadId = await ctx.db.insert("threads", {
            projectId: project._id,
            supplierId: supplier._id,
            providerThreadId,
            lastMessageAt: receivedAt,
            followUpsSent: 0,
          });
        }
        await ctx.db.patch(supplier._id, { status: "replied" });
      }
    }
    // 3) No match at all: falls into the "Unmatched" bucket (threadId/
    // supplierId left undefined) rather than being dropped.

    if (threadId) {
      await ctx.db.patch(threadId, { lastMessageAt: receivedAt });
    }

    const attachments = parseAttachments(args.message);
    const messageId = await ctx.db.insert("messages", {
      threadId,
      projectId: project._id,
      supplierId,
      providerMessageId,
      direction: "in",
      subject,
      bodyText,
      attachmentIds: [],
      receivedAt,
      processed: false,
    });

    await ctx.db.insert("events", {
      projectId: project._id,
      type: supplierId ? "message_received" : "message_unmatched",
      payload: { messageId, from: fromAddress, subject },
      createdAt: receivedAt,
    });

    if (attachments.length > 0) {
      await ctx.scheduler.runAfter(0, internal.inbound.downloadAttachments, {
        messageId,
        inboxId,
        providerMessageId,
        attachments,
      });
    }
    return null;
  },
});

// Scheduled (not called directly from the mutation above): downloading
// attachment bytes needs `fetch`, which mutations can't do - only actions.
export const downloadAttachments = internalAction({
  args: {
    messageId: v.id("messages"),
    inboxId: v.string(),
    providerMessageId: v.string(),
    attachments: v.array(
      v.object({
        attachmentId: v.string(),
        filename: v.string(),
        contentType: v.optional(v.string()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const apiKey = process.env.AGENTMAIL_API_KEY;
    if (!apiKey) {
      return null;
    }
    const baseUrl = process.env.AGENTMAIL_BASE_URL ?? "https://api.agentmail.to/v0";

    const storageIds: Id<"_storage">[] = [];
    for (const attachment of args.attachments) {
      try {
        const url =
          `${baseUrl}/inboxes/${encodeURIComponent(args.inboxId)}` +
          `/messages/${encodeURIComponent(args.providerMessageId)}` +
          `/attachments/${encodeURIComponent(attachment.attachmentId)}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
        if (res.ok) {
          const blob = await res.blob();
          storageIds.push(await ctx.storage.store(blob));
        }
      } catch {
        // Best-effort: one failed attachment shouldn't block the others.
      }
    }

    if (storageIds.length > 0) {
      await ctx.runMutation(internal.inbound.attachDownloadedFiles, {
        messageId: args.messageId,
        storageIds,
      });
    }
    return null;
  },
});

export const attachDownloadedFiles = internalMutation({
  args: { messageId: v.id("messages"), storageIds: v.array(v.id("_storage")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      return null;
    }
    await ctx.db.patch(args.messageId, {
      attachmentIds: [...message.attachmentIds, ...args.storageIds],
    });
    return null;
  },
});
