import { AgentMail } from "@agentmail/convex";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { scheduleFollowUpCheck } from "./followups";
import { requireProjectOwner } from "./lib/auth";

const agentmail = new AgentMail(components.agentmail);

const draftKind = v.union(
  v.literal("rfq"),
  v.literal("follow_up"),
  v.literal("counter"),
  v.literal("award"),
  v.literal("decline"),
  v.literal("reply"),
);
const draftStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("sent"),
  v.literal("discarded"),
);

const draftFields = {
  _id: v.id("drafts"),
  _creationTime: v.number(),
  projectId: v.id("projects"),
  supplierId: v.id("suppliers"),
  kind: draftKind,
  subject: v.string(),
  body: v.string(),
  status: draftStatus,
};

export const listDrafts = query({
  args: { projectId: v.id("projects") },
  returns: v.array(v.object(draftFields)),
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return ctx.db
      .query("drafts")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(500);
  },
});

export const updateDraft = mutation({
  args: {
    draftId: v.id("drafts"),
    subject: v.optional(v.string()),
    body: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId);
    if (!draft) {
      throw new Error("Draft not found");
    }
    await requireProjectOwner(ctx, draft.projectId);
    if (draft.status !== "pending") {
      throw new Error("Only a pending draft can be edited");
    }
    const patch: Partial<{ subject: string; body: string }> = {};
    if (args.subject !== undefined) patch.subject = args.subject;
    if (args.body !== undefined) patch.body = args.body;
    await ctx.db.patch(args.draftId, patch);
    return null;
  },
});

export const discardDraft = mutation({
  args: { draftId: v.id("drafts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId);
    if (!draft) {
      throw new Error("Draft not found");
    }
    await requireProjectOwner(ctx, draft.projectId);
    if (draft.status !== "pending") {
      throw new Error("Only a pending draft can be discarded");
    }
    await ctx.db.patch(args.draftId, { status: "discarded" });
    return null;
  },
});

// Approve-and-send in one step. Enforces the DEMO_MODE allowlist: while
// DEMO_MODE=true, a send to any recipient not on DEMO_ALLOWLIST is refused
// loudly and logged, rather than silently dropped or sent for real — see the
// build plan's non-negotiable rule #3. The block case returns a structured
// failure instead of throwing: Convex mutations are transactional, so a
// throw would roll back the very event log entry meant to record the block.
export const sendRfq = mutation({
  args: { draftId: v.id("drafts") },
  returns: v.object({ ok: v.boolean(), blockedReason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId);
    if (!draft) {
      throw new Error("Draft not found");
    }
    await requireProjectOwner(ctx, draft.projectId);
    if (draft.status !== "pending") {
      throw new Error("Draft is not pending");
    }

    const supplier = await ctx.db.get(draft.supplierId);
    if (!supplier) {
      throw new Error("Supplier not found");
    }
    if (!supplier.email) {
      throw new Error("Supplier has no email on file");
    }
    const project = await ctx.db.get(draft.projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    if (!project.inboxId) {
      throw new Error("Project has no inbox yet - provision one first");
    }

    if (process.env.DEMO_MODE === "true") {
      const allowlist = (process.env.DEMO_ALLOWLIST ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0);
      if (!allowlist.includes(supplier.email.toLowerCase())) {
        const blockedReason = `DEMO_MODE is on: ${supplier.email} is not on the allowlist. Refusing to send.`;
        await ctx.db.insert("events", {
          projectId: draft.projectId,
          type: "rfq_send_blocked",
          payload: {
            supplierId: draft.supplierId,
            email: supplier.email,
            reason: "DEMO_MODE: recipient is not on DEMO_ALLOWLIST",
          },
          createdAt: Date.now(),
        });
        return { ok: false, blockedReason };
      }
    }

    const outboundId = await agentmail.sendMessage(ctx, project.inboxId, {
      to: supplier.email,
      subject: draft.subject,
      text: draft.body,
    });

    const threadId = await ctx.db.insert("threads", {
      projectId: draft.projectId,
      supplierId: draft.supplierId,
      providerThreadId: outboundId,
      lastMessageAt: Date.now(),
      followUpsSent: 0,
    });
    await ctx.db.insert("messages", {
      threadId,
      projectId: draft.projectId,
      supplierId: draft.supplierId,
      providerMessageId: outboundId,
      direction: "out",
      subject: draft.subject,
      bodyText: draft.body,
      attachmentIds: [],
      receivedAt: Date.now(),
      processed: true,
    });
    await ctx.db.patch(draft.supplierId, { status: "rfq_sent" });
    await ctx.db.patch(args.draftId, { status: "sent" });
    if (project.status !== "rfq_sent") {
      await ctx.db.patch(draft.projectId, { status: "rfq_sent" });
    }
    await ctx.db.insert("events", {
      projectId: draft.projectId,
      type: "rfq_sent",
      payload: { supplierId: draft.supplierId, supplierName: supplier.name },
      createdAt: Date.now(),
    });
    await scheduleFollowUpCheck(ctx, threadId);
    return { ok: true };
  },
});

// Internal: called by rfq.ts's draftRfqs action (kind "rfq") and
// quoteExtraction.ts's processInboundMessage (kind "reply", for a
// supplier's question).
export const insertDraft = internalMutation({
  args: {
    projectId: v.id("projects"),
    supplierId: v.id("suppliers"),
    kind: draftKind,
    subject: v.string(),
    body: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("drafts", {
      projectId: args.projectId,
      supplierId: args.supplierId,
      kind: args.kind,
      subject: args.subject,
      body: args.body,
      status: "pending",
    });
    return null;
  },
});
