import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner } from "./lib/auth";

function normalizeIdentity(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}
function supplierIdentity(s: { email?: string; website?: string; name: string }): string {
  const email = normalizeIdentity(s.email);
  if (email) return `email:${email}`;
  const website = normalizeIdentity(s.website);
  if (website) return `site:${website}`;
  return `name:${normalizeIdentity(s.name)}`;
}
function riskLevel(flags: number, coverage: number, confidence: number): "low" | "medium" | "high" {
  if (flags >= 3 || coverage < 70 || confidence < 0.55) return "high";
  if (flags >= 1 || coverage < 100 || confidence < 0.75) return "medium";
  return "low";
}

export const supplierIntelligence = query({
  args: { projectId: v.id("projects") },
  returns: v.array(v.object({
    supplierId: v.id("suppliers"), supplierName: v.string(), quoteCount: v.number(), historicalProjects: v.number(),
    averageConfidence: v.number(), coveragePercent: v.number(), revisions: v.number(), latestQuoteVersion: v.optional(v.number()),
    averageLeadTimeDays: v.optional(v.number()), risk: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    riskFlags: v.array(v.string()), negotiationSignals: v.array(v.string()),
  })),
  handler: async (ctx, args) => {
    const project = await requireProjectOwner(ctx, args.projectId);
    const suppliers = await ctx.db.query("suppliers").withIndex("by_project", q => q.eq("projectId", args.projectId)).take(500);
    const ownerProjects = await ctx.db.query("projects").withIndex("by_owner", q => q.eq("ownerId", project.ownerId)).take(500);
    const allSuppliers: Array<{ _id: typeof suppliers[number]["_id"]; projectId: typeof suppliers[number]["projectId"]; name: string; email?: string; website?: string }> = [];
    for (const p of ownerProjects) {
      const rows = await ctx.db.query("suppliers").withIndex("by_project", q => q.eq("projectId", p._id)).take(500);
      allSuppliers.push(...rows);
    }
    const quotes = await ctx.db.query("quotes").withIndex("by_project", q => q.eq("projectId", args.projectId)).take(2000);
    const quoteLines = await ctx.db.query("quoteLines").withIndex("by_project", q => q.eq("projectId", args.projectId)).take(5000);
    const lineItems = await ctx.db.query("lineItems").withIndex("by_project", q => q.eq("projectId", args.projectId)).take(1000);
    const lineCount = lineItems.length;
    const latestBySupplier = new Map<string, typeof quotes[number]>();
    for (const quote of quotes) {
      const current = latestBySupplier.get(quote.supplierId as string);
      if (!current || quote.version > current.version) latestBySupplier.set(quote.supplierId as string, quote);
    }
    const linesByQuote = new Map<string, typeof quoteLines>();
    for (const line of quoteLines) linesByQuote.set(line.quoteId as string, [...(linesByQuote.get(line.quoteId as string) ?? []), line]);

    return suppliers.map(supplier => {
      const identity = supplierIdentity(supplier);
      const historicalMatches = allSuppliers.filter(s => supplierIdentity(s) === identity);
      const historicalProjects = new Set(historicalMatches.map(s => s.projectId as string));
      const projectQuotes = quotes.filter(q => q.supplierId === supplier._id);
      const latest = latestBySupplier.get(supplier._id as string);
      const latestLines = latest ? (linesByQuote.get(latest._id as string) ?? []) : [];
      const matchedLatest = latestLines.filter(l => l.lineItemId !== undefined).length;
      const coveragePercent = lineCount > 0 ? Math.round((matchedLatest / lineCount) * 100) : 0;
      const averageConfidence = latestLines.length > 0 ? latestLines.reduce((sum, l) => sum + l.matchConfidence, 0) / latestLines.length : 0;
      const revisions = projectQuotes.filter(q => q.version > 1).length;
      const leadTimes = projectQuotes.map(q => q.leadTimeDays).filter((n): n is number => n !== undefined);
      const riskFlags: string[] = [];
      if (latest && coveragePercent < 100) riskFlags.push("Incomplete scope");
      if (latest && averageConfidence < 0.75) riskFlags.push("Low match confidence");
      if (latest?.validUntil !== undefined && latest.validUntil < Date.now()) riskFlags.push("Quote validity expired");
      if (revisions > 0) riskFlags.push("Quote revised");
      if (latest?.deliveryCost !== undefined && latest.deliveryCost > 0) riskFlags.push("Delivery cost included");
      const negotiationSignals: string[] = [];
      if (latest) {
        if (revisions > 0) negotiationSignals.push("Supplier has already revised pricing");
        if (coveragePercent < 100) negotiationSignals.push("Ask supplier to price missing scope items");
        if (latest.deliveryCost && latest.deliveryCost > 0) negotiationSignals.push("Delivery cost is a negotiation lever");
        if (latest.leadTimeDays !== undefined) negotiationSignals.push(`Quoted lead time: ${latest.leadTimeDays} days`);
        if (latest.validUntil !== undefined && latest.validUntil > Date.now()) negotiationSignals.push(`Quote valid until ${new Date(latest.validUntil).toLocaleDateString()}`);
      }
      return {
        supplierId: supplier._id, supplierName: supplier.name, quoteCount: projectQuotes.length,
        historicalProjects: Math.max(0, historicalProjects.size - 1), averageConfidence, coveragePercent, revisions,
        latestQuoteVersion: latest?.version, averageLeadTimeDays: leadTimes.length > 0 ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : undefined,
        risk: riskLevel(riskFlags.length, coveragePercent, averageConfidence), riskFlags, negotiationSignals,
      };
    });
  },
});
