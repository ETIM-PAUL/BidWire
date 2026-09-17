import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireProjectOwner } from "./lib/auth";

const listPriceFields = {
  itemHint: v.string(),
  price: v.number(),
  unit: v.string(),
};

const supplierFields = {
  _id: v.id("suppliers"),
  _creationTime: v.number(),
  projectId: v.id("projects"),
  name: v.string(),
  website: v.optional(v.string()),
  email: v.optional(v.string()),
  source: v.union(v.literal("firecrawl"), v.literal("manual"), v.literal("demo")),
  categories: v.array(v.string()),
  listPrices: v.optional(v.array(v.object(listPriceFields))),
  status: v.union(
    v.literal("candidate"),
    v.literal("selected"),
    v.literal("rfq_sent"),
    v.literal("replied"),
    v.literal("declined"),
    v.literal("silent"),
  ),
};

export const listSuppliers = query({
  args: { projectId: v.id("projects") },
  returns: v.array(v.object(supplierFields)),
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return ctx.db
      .query("suppliers")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(500);
  },
});

// In DEMO_MODE, only demo-sourced suppliers (team-controlled inboxes) can be
// selected for an RFQ. Real scraped suppliers stay visible but non-selectable
// so a live demo never accidentally emails a real business. This is enforced
// here, not just in the UI, since selection gates what Phase 5 sends to.
export const toggleSupplierSelected = mutation({
  args: { supplierId: v.id("suppliers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const supplier = await ctx.db.get(args.supplierId);
    if (!supplier) {
      throw new Error("Supplier not found");
    }
    await requireProjectOwner(ctx, supplier.projectId);

    const nextStatus = supplier.status === "selected" ? "candidate" : "selected";
    if (nextStatus === "selected" && process.env.DEMO_MODE === "true" && supplier.source !== "demo") {
      throw new Error(
        "DEMO_MODE is on: only demo suppliers can be selected for an RFQ.",
      );
    }
    await ctx.db.patch(args.supplierId, { status: nextStatus });
    return null;
  },
});

export const getPublicConfig = query({
  args: {},
  returns: v.object({ demoMode: v.boolean() }),
  handler: async () => {
    return { demoMode: process.env.DEMO_MODE === "true" };
  },
});

// Internal: called by discovery.ts after Firecrawl extraction. Dedupe by
// domain within the project so re-running discovery doesn't create
// duplicate candidates for the same business.
export const insertDiscoveredSupplier = internalMutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    website: v.string(),
    domain: v.string(),
    email: v.optional(v.string()),
    categories: v.array(v.string()),
    listPrices: v.array(v.object(listPriceFields)),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("suppliers")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(500);
    const alreadyHaveDomain = existing.some(
      (s) => s.website && extractDomain(s.website) === args.domain,
    );
    if (alreadyHaveDomain) {
      return null;
    }
    await ctx.db.insert("suppliers", {
      projectId: args.projectId,
      name: args.name,
      website: args.website,
      email: args.email,
      source: "firecrawl",
      categories: args.categories,
      listPrices: args.listPrices.length > 0 ? args.listPrices : undefined,
      status: "candidate",
    });
    return null;
  },
});

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const DEMO_SUPPLIER_NAMES = [
  "Ace Building Supply (Demo)",
  "Metro Hardware (Demo)",
  "Prime Materials Co. (Demo)",
];
const DEMO_CATEGORIES = [
  "Plumbing",
  "Electrical",
  "Tiling",
  "Flooring",
  "Fixtures",
  "Paint",
  "Carpentry",
];

// Idempotent: skips if this project already has demo suppliers.
export const ensureDemoSuppliers = internalMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("suppliers")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(500);
    if (existing.some((s) => s.source === "demo")) {
      return null;
    }

    const allowlist = (process.env.DEMO_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (let i = 0; i < DEMO_SUPPLIER_NAMES.length; i++) {
      const email = allowlist.length > 0 ? allowlist[i % allowlist.length] : undefined;
      await ctx.db.insert("suppliers", {
        projectId: args.projectId,
        name: DEMO_SUPPLIER_NAMES[i],
        email,
        source: "demo",
        categories: DEMO_CATEGORIES,
        status: "candidate",
      });
    }
    return null;
  },
});
