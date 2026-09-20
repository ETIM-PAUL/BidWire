import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// Run daily. Each quote's validUntil only gets flagged once, since a
// once-a-day scan naturally passes through a ~24-25h-out window exactly
// once per quote as its deadline approaches (assuming validUntil doesn't
// change) - no separate "already flagged" bookkeeping needed.
const WINDOW_START_MS = 23 * 60 * 60 * 1000;
const WINDOW_END_MS = 25 * 60 * 60 * 1000;

export const scanExpiringQuotes = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const expiringQuotes = await ctx.db
      .query("quotes")
      .withIndex("by_valid_until", (q) =>
        q.gte("validUntil", now + WINDOW_START_MS).lte("validUntil", now + WINDOW_END_MS),
      )
      .take(1000);

    for (const quote of expiringQuotes) {
      const supplier = await ctx.db.get(quote.supplierId);
      await ctx.db.insert("events", {
        projectId: quote.projectId,
        type: "quote_expiring",
        payload: {
          quoteId: quote._id,
          supplierId: quote.supplierId,
          supplierName: supplier?.name ?? "Unknown supplier",
          validUntil: quote.validUntil,
        },
        createdAt: now,
      });
    }
    return null;
  },
});
