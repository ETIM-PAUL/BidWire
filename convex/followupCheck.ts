"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { MAX_FOLLOW_UPS } from "./followups";
import { DRAFT_MODEL, structuredCall } from "./lib/llm";

const nudgeSchema = {
  type: "object",
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
  },
  required: ["subject", "body"],
  additionalProperties: false,
};
type Nudge = { subject: string; body: string };

// Scheduled by followups.ts's scheduleFollowUpCheck. Not called directly -
// this is the recurring "is this supplier still silent?" check.
export const checkFollowUp = internalAction({
  args: { threadId: v.id("threads") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.runQuery(internal.threads.getThreadById, {
      threadId: args.threadId,
    });
    if (!thread) {
      return null;
    }
    const [supplier, project] = await Promise.all([
      ctx.runQuery(internal.suppliers.getSupplierById, { supplierId: thread.supplierId }),
      ctx.runQuery(internal.projects.getProjectById, { projectId: thread.projectId }),
    ]);
    if (!supplier || !project || project.status === "cancelled") {
      return null;
    }
    // Any status other than "rfq_sent" means something already happened
    // (they replied, declined, or a prior check already marked them
    // silent) - nothing to chase.
    if (supplier.status !== "rfq_sent") {
      return null;
    }
    if (thread.followUpsSent >= MAX_FOLLOW_UPS) {
      await ctx.runMutation(internal.followups.markSupplierSilent, {
        supplierId: supplier._id,
      });
      return null;
    }
    const alreadyPending = await ctx.runQuery(internal.followups.hasPendingFollowUpDraft, {
      supplierId: supplier._id,
    });
    if (alreadyPending) {
      return null;
    }

    const nudge = await structuredCall<Nudge>({
      model: DRAFT_MODEL,
      schemaName: "follow_up_nudge",
      schema: nudgeSchema,
      system:
        "You are drafting a short, polite follow-up email on behalf of a " +
        "contractor to a materials supplier who hasn't replied to an RFQ " +
        "yet. Reference that this is a gentle reminder about the earlier " +
        "request, ask if they're able to provide pricing, and keep it brief " +
        "and courteous - no invented details about the original items or " +
        "prices.",
      input: `Project: ${project.name}\nSupplier: ${supplier.name}`,
    });

    const draftId = await ctx.runMutation(internal.followups.insertFollowUpDraft, {
      projectId: project._id,
      supplierId: supplier._id,
      subject: nudge.subject,
      body: nudge.body,
    });

    if (project.autoApproveFollowUps) {
      await ctx.runMutation(internal.followups.sendFollowUpDraftAuto, { draftId });
    }
    return null;
  },
});
