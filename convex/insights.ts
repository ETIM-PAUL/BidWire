import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireUserId } from "./lib/auth";

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

export const workspaceInsights = query({
  args: {},
  returns: v.object({
    summary: v.object({ projects: v.number(), awardedProjects: v.number(), activeProjects: v.number(), quotes: v.number(), suppliersReplied: v.number(), suppliersContacted: v.number() }),
    spendByCurrency: v.array(v.object({ currency: v.string(), totalSpend: v.number(), averageAward: v.number(), awards: v.number() })),
    spendByProject: v.array(v.object({ projectId: v.id("projects"), projectName: v.string(), status: v.string(), spend: v.number(), currency: v.string() })),
    priceSignals: v.array(v.object({ itemName: v.string(), observations: v.number(), averageUnitPrice: v.number(), lowestUnitPrice: v.number(), highestUnitPrice: v.number(), latestUnitPrice: v.number(), previousUnitPrice: v.optional(v.number()), direction: v.union(v.literal("up"), v.literal("down"), v.literal("stable")), unit: v.string(), currency: v.string() })),
    leadTimeSignals: v.array(v.object({ supplierName: v.string(), observations: v.number(), latestDays: v.number(), previousDays: v.optional(v.number()), direction: v.union(v.literal("up"), v.literal("down"), v.literal("stable")) })),
    autopilot: v.object({ pendingFollowUps: v.number(), silentSuppliers: v.number(), expiringQuotes: v.number(), projectsAwaitingComparison: v.number(), scheduledThreads: v.number() }),
  }),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const projects = await ctx.db.query("projects").withIndex("by_owner", q => q.eq("ownerId", userId)).take(500);
    const allQuotes: any[] = [];
    const allQuoteLines: any[] = [];
    const allSuppliers: any[] = [];
    const allAwards: any[] = [];
    const allThreads: any[] = [];
    const allDrafts: any[] = [];
    const allLineItems: any[] = [];
    for (const project of projects) {
      allQuotes.push(...await ctx.db.query("quotes").withIndex("by_project", q => q.eq("projectId", project._id)).take(2000));
      allQuoteLines.push(...await ctx.db.query("quoteLines").withIndex("by_project", q => q.eq("projectId", project._id)).take(5000));
      allSuppliers.push(...await ctx.db.query("suppliers").withIndex("by_project", q => q.eq("projectId", project._id)).take(500));
      allAwards.push(...await ctx.db.query("awards").withIndex("by_project", q => q.eq("projectId", project._id)).take(50));
      allThreads.push(...await ctx.db.query("threads").withIndex("by_project", q => q.eq("projectId", project._id)).take(500));
      allDrafts.push(...await ctx.db.query("drafts").withIndex("by_project", q => q.eq("projectId", project._id)).take(1000));
      allLineItems.push(...await ctx.db.query("lineItems").withIndex("by_project", q => q.eq("projectId", project._id)).take(1000));
    }
    const awardedProjects = projects.filter(p => p.status === "awarded").length;
    const awardsByCurrency = new Map<string, number[]>();
    for (const award of allAwards) {
      const project = projects.find(p => p._id === award.projectId);
      if (!project) continue;
      awardsByCurrency.set(project.currency, [...(awardsByCurrency.get(project.currency) ?? []), award.totalSpend]);
    }
    const spendByCurrency = [...awardsByCurrency.entries()].map(([currency, spends]) => ({ currency, totalSpend: spends.reduce((a, b) => a + b, 0), averageAward: spends.reduce((a, b) => a + b, 0) / spends.length, awards: spends.length }));
    const spendByProject = projects.map(p => ({ projectId: p._id, projectName: p.name, status: p.status, spend: allAwards.filter(a => a.projectId === p._id).reduce((sum, a) => sum + a.totalSpend, 0), currency: p.currency })).filter(p => p.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 8);
    const lineNames = new Map(allLineItems.map(i => [i._id as string, i]));
    const quotesById = new Map(allQuotes.map(q => [q._id as string, q]));
    const grouped = new Map<string, { itemName: string; unit: string; currency: string; prices: number[]; latest: number; previous?: number; latestAt: number }>();
    for (const line of allQuoteLines) {
      if (!line.lineItemId) continue;
      const item = lineNames.get(line.lineItemId as string);
      const quote = quotesById.get(line.quoteId as string);
      if (!item || !quote) continue;
      const key = `${normalize(item.name)}|${normalize(line.unit)}|${quote.currency}`;
      const current = grouped.get(key) ?? { itemName: item.name, unit: line.unit, currency: quote.currency, prices: [], latest: line.unitPrice, latestAt: 0 };
      current.prices.push(line.unitPrice);
      if (quote._creationTime >= current.latestAt) { current.previous = current.latestAt === 0 ? undefined : current.latest; current.latest = line.unitPrice; current.latestAt = quote._creationTime; }
      grouped.set(key, current);
    }
    const priceSignals = [...grouped.values()].filter(g => g.prices.length >= 2).map(g => ({
      itemName: g.itemName, observations: g.prices.length, averageUnitPrice: g.prices.reduce((a, b) => a + b, 0) / g.prices.length, lowestUnitPrice: Math.min(...g.prices), highestUnitPrice: Math.max(...g.prices), latestUnitPrice: g.latest, previousUnitPrice: g.previous,
      direction: g.previous === undefined || Math.abs(g.latest - g.previous) < Math.max(1, Math.abs(g.previous) * 0.02) ? "stable" as const : g.latest > g.previous ? "up" as const : "down" as const,
      unit: g.unit, currency: g.currency,
    })).sort((a, b) => b.observations - a.observations).slice(0, 12);
    const supplierById = new Map(allSuppliers.map(s => [s._id as string, s]));
    const leadGroups = new Map<string, { name: string; values: { days: number; at: number }[] }>();
    for (const quote of allQuotes) {
      if (quote.leadTimeDays === undefined) continue;
      const supplier = supplierById.get(quote.supplierId as string); if (!supplier) continue;
      const current = leadGroups.get(quote.supplierId as string) ?? { name: supplier.name, values: [] };
      current.values.push({ days: quote.leadTimeDays, at: quote._creationTime }); leadGroups.set(quote.supplierId as string, current);
    }
    const leadTimeSignals = [...leadGroups.values()].filter(g => g.values.length >= 2).map(g => { const values = [...g.values].sort((a, b) => a.at - b.at); const latest = values[values.length - 1].days; const previous = values[values.length - 2]?.days; return { supplierName: g.name, observations: values.length, latestDays: latest, previousDays: previous, direction: previous === undefined || latest === previous ? "stable" as const : latest > previous ? "up" as const : "down" as const }; }).slice(0, 12);
    const pendingFollowUps = allDrafts.filter(d => d.kind === "follow_up" && d.status === "pending").length;
    const now = Date.now();
    const expiringQuotes = allQuotes.filter(q => q.validUntil !== undefined && q.validUntil >= now && q.validUntil <= now + 7 * 24 * 60 * 60 * 1000).length;
    const scheduledThreads = allThreads.filter(t => !!t.pendingFollowUpScheduledId).length;
    return {
      summary: { projects: projects.length, awardedProjects, activeProjects: projects.filter(p => p.status !== "awarded" && p.status !== "cancelled").length, quotes: allQuotes.length, suppliersReplied: allSuppliers.filter(s => s.status === "replied").length, suppliersContacted: allSuppliers.filter(s => ["rfq_sent", "replied", "declined", "silent"].includes(s.status)).length },
      spendByCurrency, spendByProject, priceSignals, leadTimeSignals,
      autopilot: { pendingFollowUps, silentSuppliers: allSuppliers.filter(s => s.status === "silent").length, expiringQuotes, projectsAwaitingComparison: projects.filter(p => p.status === "comparing").length, scheduledThreads },
    };
  },
});
