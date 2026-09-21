import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireProjectOwner } from "./lib/auth";
import { replyInThread } from "./lib/threadReply";

const DEMO_FOLLOWUP_DELAY_MS = 2 * 60 * 1000; // 2 minutes
const PROD_FOLLOWUP_DELAY_MS = 48 * 60 * 60 * 1000; // 48 hours
export const MAX_FOLLOW_UPS = 2;

function followUpDelayMs(): number {
  return process.env.DEMO_MODE === "true" ? DEMO_FOLLOWUP_DELAY_MS : PROD_FOLLOWUP_DELAY_MS;
}

// Shared by drafts.ts's sendRfq (the first follow-up, after the original
// RFQ) and this file's performFollowUpSend (each subsequent one, up to
// MAX_FOLLOW_UPS). A plain helper rather than its own Convex mutation, per
// Convex's own guidance on ctx.runMutation overhead for same-transaction
// calls. Remembers the scheduled function's ID on the thread so a
// cancelled project can actually cancel it (see cancelProject below).
export async function scheduleFollowUpCheck(
  ctx: MutationCtx,
  threadId: Id<"threads">,
): Promise<void> {
  const scheduledId = await ctx.scheduler.runAfter(
    followUpDelayMs(),
    internal.followupCheck.checkFollowUp,
    { threadId },
  );
  await ctx.db.patch(threadId, { pendingFollowUpScheduledId: scheduledId });
}

export const setAutoApproveFollowUps = mutation({
  args: { projectId: v.id("projects"), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    await ctx.db.patch(args.projectId, { autoApproveFollowUps: args.enabled });
    return null;
  },
});

// Internal: called by followupCheck.ts's checkFollowUp before drafting a
// nudge, so a duplicate trigger (Convex scheduled actions aren't retried by
// the platform on failure, but this costs nothing to guard anyway - the
// same defensive pattern rfq.ts's draftRfqs already uses) can't pile up
// multiple pending nudges for the same supplier.
export const hasPendingFollowUpDraft = internalQuery({
  args: { supplierId: v.id("suppliers") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const drafts = await ctx.db
      .query("drafts")
      .withIndex("by_supplier", (q) => q.eq("supplierId", args.supplierId))
      .take(500);
    return drafts.some((d) => d.kind === "follow_up" && d.status === "pending");
  },
});

// Internal: called by followupCheck.ts's checkFollowUp once it has decided
// (supplier still non-responsive, under the nudge cap) that a follow-up
// draft should exist.
export const insertFollowUpDraft = internalMutation({
  args: {
    projectId: v.id("projects"),
    supplierId: v.id("suppliers"),
    subject: v.string(),
    body: v.string(),
  },
  returns: v.id("drafts"),
  handler: async (ctx, args) => {
    return ctx.db.insert("drafts", {
      projectId: args.projectId,
      supplierId: args.supplierId,
      kind: "follow_up",
      subject: args.subject,
      body: args.body,
      status: "pending",
    });
  },
});

export const markSupplierSilent = internalMutation({
  args: { supplierId: v.id("suppliers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.supplierId, { status: "silent" });
    return null;
  },
});

type SendResult = { ok: boolean; blockedReason?: string };

async function performFollowUpSend(ctx: MutationCtx, draftId: Id<"drafts">): Promise<SendResult> {
  const draft = await ctx.db.get(draftId);
  if (!draft) {
    throw new Error("Draft not found");
  }
  if (draft.kind !== "follow_up") {
    throw new Error("Not a follow-up draft");
  }
  if (draft.status !== "pending") {
    throw new Error("Draft is not pending");
  }

  const result = await replyInThread(ctx, {
    projectId: draft.projectId,
    supplierId: draft.supplierId,
    blockedEventType: "rfq_send_blocked",
    body: draft.body,
  });
  if (!result.ok) {
    return result;
  }

  await ctx.db.patch(draftId, { status: "sent" });

  const thread = await ctx.db
    .query("threads")
    .withIndex("by_supplier", (q) => q.eq("supplierId", draft.supplierId))
    .first();
  if (!thread) {
    // Unreachable in practice: replyInThread above already required one to
    // exist. Narrows the type for what follows.
    throw new Error("No thread for this supplier yet");
  }

  const followUpsSent = thread.followUpsSent + 1;
  await ctx.db.patch(thread._id, { followUpsSent, pendingFollowUpScheduledId: undefined });
  await ctx.db.insert("events", {
    projectId: draft.projectId,
    type: "follow_up_sent",
    payload: { supplierId: draft.supplierId, followUpsSent },
    createdAt: Date.now(),
  });

  if (followUpsSent >= MAX_FOLLOW_UPS) {
    await ctx.db.patch(draft.supplierId, { status: "silent" });
  } else {
    await scheduleFollowUpCheck(ctx, thread._id);
  }

  return { ok: true };
}

// Public: the contractor manually approving a pending follow-up draft from
// the UI (auto-approve off, or they just want to review it first).
export const sendFollowUpDraft = mutation({
  args: { draftId: v.id("drafts") },
  returns: v.object({ ok: v.boolean(), blockedReason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId);
    if (!draft) {
      throw new Error("Draft not found");
    }
    await requireProjectOwner(ctx, draft.projectId);
    return performFollowUpSend(ctx, args.draftId);
  },
});

// Internal: the auto-approve path, called by followupCheck.ts right after
// insertFollowUpDraft when the project has auto-approve turned on. No
// ownership check - this runs from a scheduled action with no user
// identity, the same trust boundary as the rest of the inbound pipeline.
export const sendFollowUpDraftAuto = internalMutation({
  args: { draftId: v.id("drafts") },
  returns: v.object({ ok: v.boolean(), blockedReason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    return performFollowUpSend(ctx, args.draftId);
  },
});

// Cancelling a project cancels any pending follow-up checks for its
// threads, rather than leaving them to fire against a dead project.
export const cancelProject = mutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(500);
    for (const thread of threads) {
      if (thread.pendingFollowUpScheduledId) {
        await ctx.scheduler.cancel(thread.pendingFollowUpScheduledId);
        await ctx.db.patch(thread._id, { pendingFollowUpScheduledId: undefined });
      }
    }
    await ctx.db.patch(args.projectId, { status: "cancelled" });
    await ctx.db.insert("events", {
      projectId: args.projectId,
      type: "project_cancelled",
      payload: { cancelledThreads: threads.length },
      createdAt: Date.now(),
    });
    return null;
  },
});
