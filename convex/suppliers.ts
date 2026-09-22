import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { api, components, internal } from "./_generated/api";
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
const researchSourceFields = { url: v.string(), title: v.optional(v.string()), reason: v.optional(v.string()) };
const webChangeFields = { detectedAt: v.number(), summary: v.string(), url: v.string() };

const supplierFields = {
  _id: v.id("suppliers"), _creationTime: v.number(), projectId: v.id("projects"), name: v.string(),
  website: v.optional(v.string()), email: v.optional(v.string()), phone: v.optional(v.string()),
  source: v.union(v.literal("firecrawl"), v.literal("manual"), v.literal("demo")), categories: v.array(v.string()),
  listPrices: v.optional(v.array(v.object(listPriceFields))),
  status: v.union(v.literal("candidate"), v.literal("selected"), v.literal("rfq_sent"), v.literal("replied"), v.literal("declined"), v.literal("silent")),
  researchStatus: v.optional(v.union(v.literal("idle"), v.literal("researching"), v.literal("verified"), v.literal("needs_review"), v.literal("failed"))),
  researchedAt: v.optional(v.number()), researchLocation: v.optional(v.string()), researchLocationVerified: v.optional(v.boolean()), researchCategories: v.optional(v.array(v.string())),
  researchReasons: v.optional(v.array(v.string())), researchEvidence: v.optional(v.array(v.string())), researchSources: v.optional(v.array(v.object(researchSourceFields))), researchSourceCount: v.optional(v.number()),
  researchUrls: v.optional(v.array(v.string())), mapUrls: v.optional(v.array(v.string())), crawlId: v.optional(v.string()), lastCrawlAt: v.optional(v.number()),
  monitoringEnabled: v.optional(v.boolean()), lastMonitoredAt: v.optional(v.number()), lastWebChangeAt: v.optional(v.number()), lastWebChangeSummary: v.optional(v.string()), webChangeHistory: v.optional(v.array(v.object(webChangeFields))),
};

export const listSuppliers = query({
  args: { projectId: v.id("projects") }, returns: v.array(v.object(supplierFields)),
  handler: async (ctx, args) => { await requireProjectOwner(ctx, args.projectId); return ctx.db.query("suppliers").withIndex("by_project", q => q.eq("projectId", args.projectId)).take(500); },
});

// Public because client actions use it to resolve and authorize a supplier's project.
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
    await ctx.db.insert("suppliers", { projectId: args.projectId, name: args.name, website: args.website, email: args.email, source: "firecrawl", categories: args.categories, listPrices: args.listPrices.length > 0 ? args.listPrices : undefined, status: "selected", researchStatus: "idle" });
    return null;
  },
});

function extractDomain(url: string): string { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } }

async function getOwnedSupplier(ctx: any, supplierId: any) {
  const project = await ctx.runQuery(api.suppliers.getSupplierProjectId, { supplierId });
  if (!project) throw new Error("Supplier not found");
  const suppliers = await ctx.runQuery(api.suppliers.listSuppliers, { projectId: project.projectId });
  const supplier = suppliers.find((s: any) => s._id === supplierId);
  if (!supplier) throw new Error("Supplier not found");
  return supplier;
}

const supplierResearchSchema = {
  type: "object", properties: {
    businessName: { type: "string" }, website: { type: ["string", "null"] }, email: { type: ["string", "null"] }, phone: { type: ["string", "null"] }, location: { type: ["string", "null"] },
    locationVerified: { type: "boolean" }, categories: { type: "array", items: { type: "string" } }, reasons: { type: "array", items: { type: "string" } }, evidence: { type: "array", items: { type: "string" } },
    sources: { type: "array", items: { type: "object", properties: { url: { type: "string" }, title: { type: "string" }, reason: { type: "string" } }, required: ["url"], additionalProperties: false } },
    listPrices: { type: "array", items: { type: "object", properties: { itemHint: { type: "string" }, price: { type: "number" }, unit: { type: "string" } }, required: ["itemHint", "price", "unit"], additionalProperties: false } },
    summary: { type: "string" },
  }, required: ["businessName", "locationVerified", "categories", "reasons", "evidence", "sources", "listPrices", "summary"], additionalProperties: false,
};

async function firecrawlAgent(prompt: string, urls?: string[]) {
  const key = process.env.FIRECRAWL_API_KEY; if (!key) throw new Error("FIRECRAWL_API_KEY is not configured.");
  const base = (process.env.FIRECRAWL_API_URL ?? "https://api.firecrawl.dev/v2").replace(/\/$/, "");
  const started = await fetch(`${base}/agent`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ prompt, urls, model: "spark-1-mini", maxCredits: 80, schema: supplierResearchSchema }) });
  if (!started.ok) throw new Error(`Firecrawl Agent failed: ${(await started.text()).slice(0, 300)}`);
  const initial = await started.json() as { id?: string; jobId?: string };
  const jobId = initial.id ?? initial.jobId; if (!jobId) throw new Error("Firecrawl Agent did not return a job id.");
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    const response = await fetch(`${base}/agent/${encodeURIComponent(jobId)}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!response.ok) throw new Error(`Firecrawl Agent status failed: ${(await response.text()).slice(0, 300)}`);
    const status = await response.json() as any;
    if (status.status === "completed") return status;
    if (status.status === "failed" || status.status === "cancelled") throw new Error(`Firecrawl Agent ${status.status}.`);
  }
  throw new Error("Supplier research timed out. Try again.");
}

export const setResearchStatus = internalMutation({ args: { supplierId: v.id("suppliers"), status: v.union(v.literal("idle"), v.literal("researching"), v.literal("verified"), v.literal("needs_review"), v.literal("failed")) }, returns: v.null(), handler: async (ctx, args) => { await ctx.db.patch(args.supplierId, { researchStatus: args.status }); return null; } });

export const saveResearch = internalMutation({
  args: { supplierId: v.id("suppliers"), businessName: v.string(), website: v.optional(v.string()), email: v.optional(v.string()), phone: v.optional(v.string()), location: v.optional(v.string()), locationVerified: v.boolean(), categories: v.array(v.string()), reasons: v.array(v.string()), evidence: v.array(v.string()), sources: v.array(v.object(researchSourceFields)), listPrices: v.array(v.object(listPriceFields)), summary: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const supplier = await ctx.db.get(args.supplierId); if (!supplier) return null;
    const status = args.locationVerified && args.categories.length > 0 ? "verified" : "needs_review";
    const mergedPrices = args.listPrices.length > 0 ? args.listPrices : supplier.listPrices;
    const urls = Array.from(new Set([...(supplier.researchUrls ?? []), ...args.sources.map(s => s.url), ...(args.website ? [args.website] : [])])).slice(0, 30);
    await ctx.db.patch(args.supplierId, {
      name: args.businessName || supplier.name, website: args.website ?? supplier.website, email: args.email ?? supplier.email, phone: args.phone ?? supplier.phone,
      researchStatus: status, researchedAt: Date.now(), researchLocation: args.location, researchLocationVerified: args.locationVerified, researchCategories: args.categories,
      researchReasons: args.reasons, researchEvidence: [args.summary, ...args.evidence].slice(0, 12), researchSources: args.sources, researchSourceCount: args.sources.length, researchUrls: urls, listPrices: mergedPrices,
    });
    return null;
  },
});

export const researchSupplier = action({
  args: { supplierId: v.id("suppliers") }, returns: v.null(),
  handler: async (ctx, args) => {
    const supplier = await getOwnedSupplier(ctx, args.supplierId);
    const project = await ctx.runQuery(api.projects.getProject, { projectId: supplier.projectId });
    const lineItems = await ctx.runQuery(api.lineItems.listLineItems, { projectId: supplier.projectId });
    await ctx.runMutation(internal.suppliers.setResearchStatus, { supplierId: args.supplierId, status: "researching" });
    try {
      const requested = lineItems.map(x => `${x.name} — ${x.spec} (${x.quantity} ${x.unit}; ${x.category})`).join("; ");
      const prompt = `Research this procurement supplier for BidWire. Project: ${project.name}. Required physical/service location: ${project.location}. Required items: ${requested}. Supplier candidate: ${supplier.name}. Candidate website: ${supplier.website ?? "unknown"}. Verify the actual business location, not merely a delivery/service area. Verify that the business actually sells or provides at least one requested category/item. Find an official website/contact route when possible. Capture only evidence found on public pages. Do not invent emails, phone numbers, prices, locations, certifications or products. If the location cannot be verified, set locationVerified false. Return concise reasons explaining why this supplier matches or needs review.`;
      const result = await firecrawlAgent(prompt, supplier.website ? [supplier.website] : undefined);
      const raw = result.data?.[0]?.data ?? result.data ?? {};
      const data = (raw && typeof raw === "object" ? raw : {}) as any;
      const sources = Array.isArray(data.sources) ? data.sources : (Array.isArray(result.sources) ? result.sources : []);
      await ctx.runMutation(internal.suppliers.saveResearch, {
        supplierId: args.supplierId, businessName: typeof data.businessName === "string" ? data.businessName : supplier.name, website: typeof data.website === "string" ? data.website : supplier.website,
        email: typeof data.email === "string" ? data.email : undefined, phone: typeof data.phone === "string" ? data.phone : undefined, location: typeof data.location === "string" ? data.location : undefined,
        locationVerified: data.locationVerified === true, categories: Array.isArray(data.categories) ? data.categories.filter((x: unknown): x is string => typeof x === "string") : [],
        reasons: Array.isArray(data.reasons) ? data.reasons.filter((x: unknown): x is string => typeof x === "string").slice(0, 8) : [], evidence: Array.isArray(data.evidence) ? data.evidence.filter((x: unknown): x is string => typeof x === "string").slice(0, 10) : [],
        sources: sources.filter((x: any) => x && typeof x.url === "string").slice(0, 20).map((x: any) => ({ url: x.url, title: typeof x.title === "string" ? x.title : undefined, reason: typeof x.reason === "string" ? x.reason : undefined })),
        listPrices: Array.isArray(data.listPrices) ? data.listPrices.filter((x: any) => x && typeof x.itemHint === "string" && typeof x.price === "number" && typeof x.unit === "string").slice(0, 50) : [],
        summary: typeof data.summary === "string" ? data.summary : "Research completed; review the evidence below.",
      });
    } catch (error) {
      await ctx.runMutation(internal.suppliers.setResearchStatus, { supplierId: args.supplierId, status: "failed" });
      throw error;
    }
    return null;
  },
});

const firecrawl = new FirecrawlClient(components.firecrawl);

export const mapSupplierWebsite = action({
  args: { supplierId: v.id("suppliers") }, returns: v.null(),
  handler: async (ctx, args) => {
    const supplier = await getOwnedSupplier(ctx, args.supplierId); if (!supplier.website) throw new Error("Supplier has no website to map.");
    const result = await firecrawl.map(supplier.website, { limit: 100 });
    const links = Array.isArray((result as any)?.links) ? (result as any).links.map((x: any) => typeof x === "string" ? x : x?.url).filter((x: unknown): x is string => typeof x === "string") : [];
    await ctx.runMutation(internal.suppliers.saveMapUrls, { supplierId: args.supplierId, urls: links.slice(0, 100) });
    return null;
  },
});

export const saveMapUrls = internalMutation({ args: { supplierId: v.id("suppliers"), urls: v.array(v.string()) }, returns: v.null(), handler: async (ctx, args) => { await ctx.db.patch(args.supplierId, { mapUrls: args.urls, researchUrls: args.urls.slice(0, 30) }); return null; } });

export const crawlSupplierWebsite = action({
  args: { supplierId: v.id("suppliers") }, returns: v.null(),
  handler: async (ctx, args) => {
    const supplier = await getOwnedSupplier(ctx, args.supplierId); if (!supplier.website) throw new Error("Supplier has no website to crawl.");
    const result = await firecrawl.crawl(supplier.website, { limit: 20, scrapeOptions: { formats: ["markdown"] } });
    const pages = (result.data ?? []).slice(0, 20).map((page: any) => page.metadata?.sourceURL ?? page.url).filter((x: unknown): x is string => typeof x === "string");
    await ctx.runMutation(internal.suppliers.saveCrawlResult, { supplierId: args.supplierId, crawlId: typeof (result as any).id === "string" ? (result as any).id : undefined, urls: pages });
    return null;
  },
});

export const saveCrawlResult = internalMutation({ args: { supplierId: v.id("suppliers"), crawlId: v.optional(v.string()), urls: v.array(v.string()) }, returns: v.null(), handler: async (ctx, args) => { await ctx.db.patch(args.supplierId, { crawlId: args.crawlId, lastCrawlAt: Date.now(), researchUrls: Array.from(new Set(args.urls)).slice(0, 30) }); return null; } });

export const refreshSupplierWebsite = action({
  args: { supplierId: v.id("suppliers") }, returns: v.null(),
  handler: async (ctx, args) => { await ctx.runAction(api.suppliers.researchSupplier, { supplierId: args.supplierId }); return null; },
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
    else { const revised = args.scenario === "revised_price"; text = "Dear Bidwire,\n\nPlease find our " + (revised ? "revised " : "") + "quotation:\n\n" + selected.map((x, i) => x.name + " — " + x.quantity + " " + x.unit + " @ " + price(i) * (revised ? 0.94 : 1) + " NGN").join("\n") + "\n\nDelivery: 3 days\nValid for 14 days.\n\nRegards,\nDemo Supplier"; if (args.scenario === "pdf_quote") subject = subjectPrefix + "Quotation attached — " + project.name; }
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
