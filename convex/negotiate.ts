import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { requireProjectOwner } from "./lib/auth";
import { replyInThread } from "./lib/threadReply";

const PRICE_TOLERANCE = 0.01;

function priceExistsInQuoteLines(price: number, realPrices: number[]): boolean {
  return realPrices.some((p) => Math.abs(p - price) < PRICE_TOLERANCE);
}

// Internal: called by negotiateDraft.ts's negotiateWithSupplier action.
// Guardrail: a negotiation draft may only cite prices that genuinely exist
// among this project's recorded quote lines (any supplier, any version).
// Returns a structured ok:false (not a throw) when a cited price doesn't
// match, so the action can surface a clear explanation instead of a
// hallucinated number silently becoming a "pending" draft the contractor
// might approve without noticing.
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

    // Defense in depth: re-validate at send time too, per the build plan's
    // explicit "validate ... before allowing approval" wording - catches
    // the case where the underlying quote data changed since generation.
    // This re-checks the prices captured at generation time, not a fresh
    // parse of any manual edits to the draft's text since then.
    if (draft.citedPrices && draft.citedPrices.length > 0) {
      const quoteLines = await ctx.db
        .query("quoteLines")
        .withIndex("by_project", (q) => q.eq("projectId", draft.projectId))
        .take(5000);
      const realPrices = quoteLines.map((l) => l.unitPrice);
      const invalid = draft.citedPrices.filter((p) => !priceExistsInQuoteLines(p, realPrices));
      if (invalid.length > 0) {
        return {
          ok: false,
          blockedReason: `Blocked: this draft cites a price (${invalid.join(", ")}) that no longer matches any stored quote.`,
        };
      }
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
