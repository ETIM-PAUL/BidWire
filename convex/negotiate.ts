import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireProjectOwner } from "./lib/auth";
import { replyInThread } from "./lib/threadReply";

const PRICE_TOLERANCE = 0.01;

function priceExistsInQuoteLines(price: number, realPrices: number[]): boolean {
  return realPrices.some((p) => Math.abs(p - price) < PRICE_TOLERANCE);
}

// Counter drafts deliberately use currency-prefixed price tokens and no other
// numbers. That makes the approval guardrail deterministic even after a human
// edits the draft: every number in the final subject/body must be a price
// already present in quoteLines.
function extractNumericTokens(text: string): number[] {
  const matches = text.match(/(?<![A-Za-z0-9])(?:₦|NGN|USD|\$|EUR|€|GBP|£)?\s*\d[\d,]*(?:\.\d+)?/gi) ?? [];
  return matches
    .map((token) => Number(token.replace(/[^\d.]/g, "").replace(/,/g, "")))
    .filter((value) => Number.isFinite(value));
}

async function validateCounterDraftPrices(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  body: string,
  citedPrices: number[] | undefined,
): Promise<string | null> {
  const quoteLines = await ctx.db
    .query("quoteLines")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .take(5000);
  const realPrices = quoteLines.map((l) => l.unitPrice);
  const bodyPrices = extractNumericTokens(body);

  const invalidBodyPrices = bodyPrices.filter((p) => !priceExistsInQuoteLines(p, realPrices));
  if (invalidBodyPrices.length > 0) {
    return `Blocked: this draft contains a price (${invalidBodyPrices.join(", ")}) that doesn't match any stored quote.`;
  }

  if (citedPrices) {
    const invalidCited = citedPrices.filter((p) => !priceExistsInQuoteLines(p, realPrices));
    if (invalidCited.length > 0) {
      return `Blocked: this draft cites a price (${invalidCited.join(", ")}) that doesn't match any stored quote.`;
    }
    const missingFromBody = citedPrices.filter(
      (p) => !bodyPrices.some((bodyPrice) => Math.abs(bodyPrice - p) < PRICE_TOLERANCE),
    );
    if (missingFromBody.length > 0) {
      return `Blocked: the draft's cited price (${missingFromBody.join(", ")}) is not present in the final message.`;
    }
  }

  return null;
}

// Internal: called by negotiateDraft.ts's negotiateWithSupplier action.
// Guardrail: a negotiation draft may only cite prices that genuinely exist
// among this project's recorded quote lines (any supplier, any version).
export const insertNegotiationDraft = internalMutation({
  args: {
    projectId: v.id("projects"),
    supplierId: v.id("suppliers"),
    subject: v.string(),
    body: v.string(),
    citedPrices: v.array(v.number()),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), draftId: v.id("drafts") }),
    v.object({ ok: v.literal(false), reason: v.string() }),
  ),
  handler: async (ctx, args) => {
    const quoteLines = await ctx.db
      .query("quoteLines")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(5000);
    const realPrices = quoteLines.map((l) => l.unitPrice);

    const invalidPrices = args.citedPrices.filter((p) => !priceExistsInQuoteLines(p, realPrices));
    if (invalidPrices.length > 0) {
      return {
        ok: false as const,
        reason: `Blocked: this draft cites a price (${invalidPrices.join(", ")}) that doesn't match any stored quote.`,
      };
    }

    const draftId = await ctx.db.insert("drafts", {
      projectId: args.projectId,
      supplierId: args.supplierId,
      kind: "counter",
      subject: args.subject,
      body: args.body,
      status: "pending",
      citedPrices: args.citedPrices,
    });
    return { ok: true as const, draftId };
  },
});

export const sendNegotiationDraft = mutation({
  args: { draftId: v.id("drafts") },
  returns: v.object({ ok: v.boolean(), blockedReason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId);
    if (!draft) {
      throw new Error("Draft not found");
    }
    await requireProjectOwner(ctx, draft.projectId);
    if (draft.kind !== "counter") {
      throw new Error("Not a negotiation draft");
    }
    if (draft.status !== "pending") {
      throw new Error("Draft is not pending");
    }

    const validationError = await validateCounterDraftPrices(
      ctx,
      draft.projectId,
      draft.subject + "\n" + draft.body,
      draft.citedPrices,
    );
    if (validationError) {
      return { ok: false, blockedReason: validationError };
    }

    const result = await replyInThread(ctx, {
      projectId: draft.projectId,
      supplierId: draft.supplierId,
      blockedEventType: "negotiation_send_blocked",
      body: draft.body,
    });
    if (!result.ok) {
      return result;
    }

    await ctx.db.patch(args.draftId, { status: "sent" });
    await ctx.db.insert("events", {
      projectId: draft.projectId,
      type: "negotiation_sent",
      payload: { supplierId: draft.supplierId },
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});
