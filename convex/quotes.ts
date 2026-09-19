import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireProjectOwner } from "./lib/auth";

const MATCH_CONFIDENCE_THRESHOLD = 0.7;

// Known, fixed unit conversions - deterministic code, never LLM arithmetic.
// { fromUnit: { toUnit: factor } } where 1 fromUnit = `factor` toUnit.
const UNIT_CONVERSIONS: Record<string, Record<string, number>> = {
  tonne: { kg: 1000, kilogram: 1000, kilograms: 1000 },
  ton: { kg: 1000, kilogram: 1000, kilograms: 1000 },
  kg: { g: 1000, gram: 1000, grams: 1000 },
  kilogram: { g: 1000, gram: 1000, grams: 1000 },
  litre: { ml: 1000, milliliter: 1000, milliliters: 1000 },
  liter: { ml: 1000, milliliter: 1000, milliliters: 1000 },
  m: { cm: 100, centimeter: 100, centimeters: 100 },
  meter: { cm: 100, centimeter: 100, centimeters: 100 },
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

// Converts (quantity, unitPrice) FROM one unit TO another when a known,
// fixed conversion exists. Returns null (leave the raw quoted unit as-is -
// the mismatch is itself the "flag") when no known conversion applies.
function normalizeUnit(
  fromUnit: string,
  fromQuantity: number,
  fromUnitPrice: number,
  toUnit: string,
): { quantity: number; unitPrice: number; unit: string } | null {
  const from = fromUnit.trim().toLowerCase();
  const to = toUnit.trim().toLowerCase();
  if (from === to) {
    return null;
  }
  const factor = UNIT_CONVERSIONS[from]?.[to];
  if (factor) {
    return { quantity: fromQuantity * factor, unitPrice: fromUnitPrice / factor, unit: toUnit };
  }
  const inverseFactor = UNIT_CONVERSIONS[to]?.[from];
  if (inverseFactor) {
    return {
      quantity: fromQuantity / inverseFactor,
      unitPrice: fromUnitPrice * inverseFactor,
      unit: toUnit,
    };
  }
  return null;
}

// Internal: only called by quoteExtraction.ts's processInboundMessage, after
// a "quote"/"partial_quote" classification. `projectId`/`supplierId`/
// `messageId` come from the caller's OWN resolved context (the message
// row), never from the LLM's output - the extraction JSON schema has no
// identity/routing fields at all, so there is structurally no channel for
// a malicious email to redirect a write to a different supplier's quote.
export const recordQuote = internalMutation({
  args: {
    projectId: v.id("projects"),
    supplierId: v.id("suppliers"),
    messageId: v.id("messages"),
    validUntil: v.union(v.string(), v.null()),
    leadTimeDays: v.union(v.number(), v.null()),
    deliveryCost: v.union(v.number(), v.null()),
    currency: v.string(),
    notes: v.union(v.string(), v.null()),
    lines: v.array(
      v.object({
        rawDescription: v.string(),
        unitPrice: v.number(),
        unit: v.string(),
        quantity: v.number(),
        matchedLineItemId: v.union(v.string(), v.null()),
        matchConfidence: v.number(),
      }),
    ),
  },
  returns: v.id("quotes"),
  handler: async (ctx, args) => {
    // New version for this supplier; the comparison (Phase 8) uses the
    // latest version only.
    const priorQuotes = await ctx.db
      .query("quotes")
      .withIndex("by_supplier", (q) => q.eq("supplierId", args.supplierId))
      .take(1000);
    const version = priorQuotes.reduce((max, q) => Math.max(max, q.version), 0) + 1;

    // Valid match targets: only this project's OWN line items. A
    // matchedLineItemId the model returned that isn't one of these
    // (hallucinated, or - worst case - an attempted cross-tenant reference)
    // is treated as no match, never trusted directly.
    const lineItems = await ctx.db
      .query("lineItems")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(1000);
    const lineItemById = new Map(lineItems.map((li) => [li._id as string, li]));

    const overallConfidence =
      args.lines.length > 0
        ? clamp01(args.lines.reduce((sum, l) => sum + l.matchConfidence, 0) / args.lines.length)
        : 0;

    const parsedValidUntil = args.validUntil ? Date.parse(args.validUntil) : NaN;

    const quoteId = await ctx.db.insert("quotes", {
      projectId: args.projectId,
      supplierId: args.supplierId,
      messageId: args.messageId,
      validUntil: Number.isFinite(parsedValidUntil) ? parsedValidUntil : undefined,
      leadTimeDays: args.leadTimeDays ?? undefined,
      deliveryCost: args.deliveryCost ?? undefined,
      currency: args.currency,
      confidence: overallConfidence,
      notes: args.notes ?? undefined,
      version,
    });

    for (const line of args.lines) {
      const confidence = clamp01(line.matchConfidence);
      const candidate = line.matchedLineItemId
        ? lineItemById.get(line.matchedLineItemId)
        : undefined;
      // Only auto-match at or above the confidence threshold; below it, the
      // line is stored unmatched so it surfaces in the "Needs review" strip
      // instead of being silently auto-matched.
      const matched = candidate && confidence >= MATCH_CONFIDENCE_THRESHOLD ? candidate : undefined;

      let unit = line.unit;
      let quantity = line.quantity;
      let unitPrice = line.unitPrice;
      if (matched && matched.unit.trim().toLowerCase() !== unit.trim().toLowerCase()) {
        const normalized = normalizeUnit(unit, quantity, unitPrice, matched.unit);
        if (normalized) {
          unit = normalized.unit;
          quantity = normalized.quantity;
          unitPrice = normalized.unitPrice;
        }
        // else: no known conversion - stored as raw-quoted unit, and the
        // mismatch against matched.unit IS the flag (Phase 8 can detect it).
      }

      await ctx.db.insert("quoteLines", {
        quoteId,
        projectId: args.projectId,
        supplierId: args.supplierId,
        lineItemId: matched?._id as Id<"lineItems"> | undefined,
        rawDescription: line.rawDescription,
        unitPrice,
        unit,
        quantity,
        total: unitPrice * quantity,
        matchConfidence: confidence,
      });
    }

    return quoteId;
  },
});

const quoteFields = {
  _id: v.id("quotes"),
  _creationTime: v.number(),
  projectId: v.id("projects"),
  supplierId: v.id("suppliers"),
  messageId: v.id("messages"),
  validUntil: v.optional(v.number()),
  leadTimeDays: v.optional(v.number()),
  deliveryCost: v.optional(v.number()),
  currency: v.string(),
  confidence: v.number(),
  notes: v.optional(v.string()),
  version: v.number(),
};

const quoteLineFields = {
  _id: v.id("quoteLines"),
  _creationTime: v.number(),
  quoteId: v.id("quotes"),
  projectId: v.id("projects"),
  supplierId: v.id("suppliers"),
  lineItemId: v.optional(v.id("lineItems")),
  rawDescription: v.string(),
  unitPrice: v.number(),
  unit: v.string(),
  quantity: v.number(),
  total: v.number(),
  matchConfidence: v.number(),
};

export const getQuoteForMessage = query({
  args: { messageId: v.id("messages") },
  returns: v.union(
    v.object({ quote: v.object(quoteFields), lines: v.array(v.object(quoteLineFields)) }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }
    await requireProjectOwner(ctx, message.projectId);
    const quote = await ctx.db
      .query("quotes")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .unique();
    if (!quote) {
      return null;
    }
    const lines = await ctx.db
      .query("quoteLines")
      .withIndex("by_quote", (q) => q.eq("quoteId", quote._id))
      .take(500);
    return { quote, lines };
  },
});

// The "Needs review" strip: quote lines the extraction pipeline couldn't
// confidently auto-match to a line item.
export const listNeedsReview = query({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      ...quoteLineFields,
      supplierName: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const lines = await ctx.db
      .query("quoteLines")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(1000);
    const needsReview = lines.filter((l) => l.lineItemId === undefined);
    return Promise.all(
      needsReview.map(async (line) => {
        const supplier = await ctx.db.get(line.supplierId);
        return { ...line, supplierName: supplier?.name ?? "Unknown supplier" };
      }),
    );
  },
});

// Lets the contractor manually confirm a low-confidence (or otherwise
// unmatched) quote line against a line item from the Needs Review strip.
export const confirmQuoteLineMatch = mutation({
  args: { quoteLineId: v.id("quoteLines"), lineItemId: v.id("lineItems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const line = await ctx.db.get(args.quoteLineId);
    if (!line) {
      throw new Error("Quote line not found");
    }
    await requireProjectOwner(ctx, line.projectId);
    const lineItem = await ctx.db.get(args.lineItemId);
    if (!lineItem || lineItem.projectId !== line.projectId) {
      throw new Error("Line item not found in this project");
    }
    await ctx.db.patch(args.quoteLineId, { lineItemId: args.lineItemId, matchConfidence: 1 });
    return null;
  },
});
