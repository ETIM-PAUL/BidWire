import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { api, components } from "./_generated/api";
import { requireProjectOwner } from "./lib/auth";
import { FirecrawlClient } from "@firecrawl/firecrawl-convex";

function isDemoAdmin(identity: { email?: string | null } | null): boolean {
  const allowed = (process.env.DEMO_ADMIN_EMAILS ?? "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  return process.env.DEMO_MODE === "true" && !!identity?.email && allowed.includes(identity.email.toLowerCase());
}

function demoPdfBase64(text: string): string {
  const esc = text.replace(/([\\()])/g, "\\$1");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    "<< /Length " + String(("BT /F1 14 Tf 72 720 Td (" + esc + ") Tj ET").length) + " >>\\nstream\\nBT /F1 14 Tf 72 720 Td (" + esc + ") Tj ET\\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\\n", offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(pdf.length); pdf += (i + 1) + " 0 obj\\n" + objects[i] + "\\nendobj\\n"; }
  const xref = pdf.length;
  pdf += "xref\\n0 " + String(objects.length + 1) + "\\n0000000000 65535 f \\n";
  for (let i = 1; i < offsets.length; i++) pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \\n";
  pdf += "trailer\\n<< /Size " + String(objects.length + 1) + " /Root 1 0 R >>\\nstartxref\\n" + String(xref) + "\\n%%EOF";
  return btoa(pdf);
}

const listPriceFields = { itemHint: v.string(), price: v.number(), unit: v.string() };
const supplierFields = {
  _id: v.id("suppliers"), _creationTime: v.number(), projectId: v.id("projects"), name: v.string(),
  website: v.optional(v.string()), email: v.optional(v.string()),
  source: v.union(v.literal("firecrawl"), v.literal("manual"), v.literal("demo")), categories: v.array(v.string()),
  listPrices: v.optional(v.array(v.object(listPriceFields))),
  status: v.union(v.literal("candidate"), v.literal("selected"), v.literal("rfq_sent"), v.literal("replied"), v.literal("declined"), v.literal("silent")),
};

export const listSuppliers = query({
  args: { projectId: v.id("projects") }, returns: v.array(v.object(supplierFields)),
  handler: async (ctx, args) => { await requireProjectOwner(ctx, args.projectId); return ctx.db.query("suppliers").withIndex("by_project", q => q.eq("projectId", args.projectId)).take(500); },
});

export const getSupplierProjectId = query({
  args: { supplierId: v.id("suppliers") }, returns: v.union(v.object({ projectId: v.id("projects") }), v.null()),
  handler: async (ctx, args) => { const supplier = await ctx.db.get(args.supplierId); if (!supplier) return null; await requireProjectOwner(ctx, supplier.projectId); return { projectId: supplier.projectId }; },
});

export const getSupplierById = internalQuery({
  args: { supplierId: v.id("suppliers") }, returns: v.union(v.object(supplierFields), v.null()), handler: async (ctx, args) => ctx.db.get(args.supplierId),
});

export const toggleSupplierSelected = mutation({
  args: { supplierId: v.id("suppliers") }, returns: v.null(),
  handler: async (ctx, args) => {
    const supplier = await ctx.db.get(args.supplierId); if (!supplier) throw new Error("Supplier not found");
    await requireProjectOwner(ctx, supplier.projectId);
    const nextStatus = supplier.status === "selected" ? "candidate" : "selected";
    if (nextStatus === "selected" && process.env.DEMO_MODE === "true" && supplier.source !== "demo") throw new Error("DEMO_MODE is on: only demo suppliers can be selected for an RFQ.");
    await ctx.db.patch(args.supplierId, { status: nextStatus }); return null;
  },
});

export const getPublicConfig = query({ args: {}, returns: v.object({ demoMode: v.boolean() }), handler: async () => ({ demoMode: process.env.DEMO_MODE === "true" }) });
export const markDeclined = internalMutation({ args: { supplierId: v.id("suppliers") }, returns: v.null(), handler: async (ctx, args) => { await ctx.db.patch(args.supplierId, { status: "declined" }); return null; } });
export const markReplied = internalMutation({ args: { supplierId: v.id("suppliers") }, returns: v.null(), handler: async (ctx, args) => { await ctx.db.patch(args.supplierId, { status: "replied" }); return null; } });

export const insertDiscoveredSupplier = internalMutation({
  args: { projectId: v.id("projects"), name: v.string(), website: v.string(), domain: v.string(), email: v.optional(v.string()), categories: v.array(v.string()), listPrices: v.array(v.object(listPriceFields)) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("suppliers").withIndex("by_project", q => q.eq("projectId", args.projectId)).take(500);
    if (existing.some(s => s.website && extractDomain(s.website) === args.domain)) return null;
    await ctx.db.insert("suppliers", { projectId: args.projectId, name: args.name, website: args.website, email: args.email, source: "firecrawl", categories: args.categories, listPrices: args.listPrices.length > 0 ? args.listPrices : undefined, status: "selected" });
    return null;
  },
});

function extractDomain(url: string): string { try { return new URL(url).hostname.replace(/^www\\./, ""); } catch { return url; } }

async function getOwnedSupplier(ctx: any, supplierId: any) {
  const project = await ctx.runQuery(api.suppliers.getSupplierProjectId, { supplierId });
  if (!project) throw new Error("Supplier not found");
  const suppliers = await ctx.runQuery(api.suppliers.listSuppliers, { projectId: project.projectId });
  const supplier = suppliers.find((s: any) => s._id === supplierId);
  if (!supplier) throw new Error("Supplier not found");
  return supplier;
}

async function firecrawlRequest(ctx: any, url: string, operation: "research" | "map") {
  const client = new FirecrawlClient(components.firecrawl);
  if (operation === "research") {
    const page = await client.scrape(ctx, url, { formats: ["markdown"] });
    return { operation, url, title: page.metadata?.title ?? null, description: page.metadata?.description ?? null, markdown: (page.markdown ?? "").slice(0, 30000), links: Array.isArray(page.links) ? page.links.slice(0, 100) : [] };
  }
  const result = await client.map(ctx, url, { limit: 100 });
  return { operation, url, links: Array.isArray(result.links) ? result.links : [] };
}

export const researchSupplier = action({
  args: { supplierId: v.id("suppliers") }, returns: v.any(),
  handler: async (ctx, args) => {
    const supplier = await getOwnedSupplier(ctx, args.supplierId);
    if (!supplier.website) throw new Error("Supplier has no website to research.");
    return firecrawlRequest(ctx, supplier.website, "research");
  },
});

export const mapSupplierWebsite = action({
  args: { supplierId: v.id("suppliers") }, returns: v.any(),
  handler: async (ctx, args) => {
    const supplier = await getOwnedSupplier(ctx, args.supplierId);
    if (!supplier.website) throw new Error("Supplier has no website to map.");
    return firecrawlRequest(ctx, supplier.website, "map");
  },
});

export const crawlSupplierWebsite = action({
  args: { supplierId: v.id("suppliers") }, returns: v.any(),
  handler: async (ctx, args) => {
    const supplier = await getOwnedSupplier(ctx, args.supplierId);
    if (!supplier.website) throw new Error("Supplier has no website to crawl.");
    const firecrawl = new FirecrawlClient(components.firecrawl);
    // Poll mode works in local Convex development without requiring Firecrawl to reach a public webhook.
    return await firecrawl.startCrawl(ctx, {
      url: supplier.website,
      mode: "poll",
      options: { limit: 20, scrapeOptions: { formats: ["markdown"] } },
    });
  },
});

export const refreshSupplierWebsite = action({
  args: { supplierId: v.id("suppliers") }, returns: v.any(),
  handler: async (ctx, args) => {
    const supplier = await getOwnedSupplier(ctx, args.supplierId);
    if (!supplier.website) throw new Error("Supplier has no website to refresh.");
    return { ...(await firecrawlRequest(ctx, supplier.website, "research")), refreshedAt: Date.now() };
  },
});

export const simulatorReplies = action({
  args: { projectId: v.id("projects"), supplierId: v.id("suppliers"), scenario: v.union(v.literal("prose_quote"), v.literal("pdf_quote"), v.literal("decline"), v.literal("revised_price")) }, returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity(); if (!isDemoAdmin(identity)) throw new Error("Demo simulator is admin-only.");
    const project = await ctx.runQuery(api.projects.getProject, { projectId: args.projectId });
    const supplier = await ctx.runQuery(api.suppliers.listDemoSuppliers, { projectId: args.projectId }).then(xs => xs.find(x => x._id === args.supplierId));
    if (!supplier) throw new Error("Simulator is limited to demo suppliers."); if (!project.inboxId) throw new Error("Project inbox is not ready."); if (!supplier.email) throw new Error("Demo supplier has no inbox address.");
    const apiKey = process.env.AGENTMAIL_API_KEY; if (!apiKey) throw new Error("AGENTMAIL_API_KEY is not configured.");
    const baseUrl = process.env.AGENTMAIL_BASE_URL ?? "https://api.agentmail.to/v0";
    const lines = await ctx.runQuery(api.lineItems.listLineItems, { projectId: args.projectId }); const selected = lines.slice(0, Math.min(lines.length, 5)); const price = (i: number) => 10000 + i * 2500;
    const subjectPrefix = "[BidWire:" + project._id + "] "; let subject = subjectPrefix + "Quotation — " + project.name, text = "";
    if (args.scenario === "decline") { subject = subjectPrefix + "Unable to quote — " + project.name; text = "Thanks for the RFQ. Unfortunately we are unable to supply this order at this time. Please keep us in mind for a future project."; }
    else { const revised = args.scenario === "revised_price"; text = "Dear Bidwire,\\n\\nPlease find our " + (revised ? "revised " : "") + "quotation:\\n\\n" + selected.map((x, i) => x.name + " — " + x.quantity + " " + x.unit + " @ " + price(i) * (revised ? 0.94 : 1) + " NGN").join("\\n") + "\\n\\nDelivery: 3 days\\nValid for 14 days.\\n\\nRegards,\\nDemo Supplier"; if (args.scenario === "pdf_quote") subject = subjectPrefix + "Quotation attached — " + project.name; }
    const response = await fetch(baseUrl + "/inboxes/" + encodeURIComponent(supplier.email) + "/messages", { method: "POST", headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ to: project.inboxAddress, subject, text, ...(args.scenario === "pdf_quote" ? { attachments: [{ content: demoPdfBase64("Demo supplier quotation"), filename: "quote.pdf", content_type: "application/pdf" }] } : {}) }) });
    if (!response.ok) throw new Error("AgentMail simulator send failed: " + (await response.text()).slice(0, 300)); return null;
  },
});

const DEMO_SUPPLIER_NAMES = ["Ace Building Supply (Demo)", "Metro Hardware (Demo)", "Prime Materials Co. (Demo)"];
const DEMO_CATEGORIES = ["Plumbing", "Electrical", "Tiling", "Flooring", "Fixtures", "Paint", "Carpentry"];

export const ensureDemoSuppliers = internalMutation({
  args: { projectId: v.id("projects") }, returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("suppliers").withIndex("by_project", q => q.eq("projectId", args.projectId)).take(500); if (existing.some(s => s.source === "demo")) return null;
    const allowlist = (process.env.DEMO_ALLOWLIST ?? "").split(",").map(s => s.trim()).filter(Boolean);
    for (let i = 0; i < DEMO_SUPPLIER_NAMES.length; i++) await ctx.db.insert("suppliers", { projectId: args.projectId, name: DEMO_SUPPLIER_NAMES[i], email: allowlist.length > 0 ? allowlist[i % allowlist.length] : undefined, source: "demo", categories: DEMO_CATEGORIES, status: "candidate" });
    return null;
  },
});

export const assignDemoSupplierEmails = internalMutation({
  args: { projectId: v.id("projects"), emails: v.array(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const suppliers = await ctx.db.query("suppliers").withIndex("by_project", q => q.eq("projectId", args.projectId)).take(500); const demoSuppliers = suppliers.filter(supplier => supplier.source === "demo"); if (demoSuppliers.length === 0) return null;
    const configured = (process.env.DEMO_ALLOWLIST ?? "").split(",").map(email => email.trim()).filter(Boolean); const pool = configured.length > 0 ? configured : args.emails; if (pool.length === 0) throw new Error("No AgentMail inbox is available for demo suppliers.");
    for (let index = 0; index < demoSuppliers.length; index++) await ctx.db.patch(demoSuppliers[index]._id, { email: pool[index % pool.length] }); return null;
  },
});

export const isDemoAdminQuery = query({ args: {}, returns: v.boolean(), handler: async ctx => isDemoAdmin(await ctx.auth.getUserIdentity()) });
export const listDemoSuppliers = query({ args: { projectId: v.id("projects") }, returns: v.array(v.object(supplierFields)), handler: async (ctx, args) => { await requireProjectOwner(ctx, args.projectId); return (await ctx.db.query("suppliers").withIndex("by_project", q => q.eq("projectId", args.projectId)).take(500)).filter(s => s.source === "demo"); } });
