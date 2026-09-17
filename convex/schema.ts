import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

  projects: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    jobDescription: v.string(),
    location: v.string(),
    currency: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("boq_ready"),
      v.literal("sourcing"),
      v.literal("rfq_sent"),
      v.literal("comparing"),
      v.literal("awarded"),
    ),
    inboxId: v.optional(v.string()),
    inboxAddress: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  lineItems: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    spec: v.string(),
    quantity: v.number(),
    unit: v.string(),
    category: v.string(),
    sortOrder: v.number(),
  }).index("by_project", ["projectId"]),

  suppliers: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    website: v.optional(v.string()),
    email: v.optional(v.string()),
    source: v.union(v.literal("firecrawl"), v.literal("manual"), v.literal("demo")),
    categories: v.array(v.string()),
    listPrices: v.optional(
      v.array(
        v.object({
          itemHint: v.string(),
          price: v.number(),
          unit: v.string(),
        }),
      ),
    ),
    status: v.union(
      v.literal("candidate"),
      v.literal("selected"),
      v.literal("rfq_sent"),
      v.literal("replied"),
      v.literal("declined"),
      v.literal("silent"),
    ),
  }).index("by_project", ["projectId"]),

  threads: defineTable({
    projectId: v.id("projects"),
    supplierId: v.id("suppliers"),
    providerThreadId: v.string(),
    lastMessageAt: v.number(),
    followUpsSent: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_supplier", ["supplierId"])
    .index("by_provider_thread_id", ["providerThreadId"]),

  messages: defineTable({
    threadId: v.id("threads"),
    projectId: v.id("projects"),
    supplierId: v.id("suppliers"),
    providerMessageId: v.string(),
    direction: v.union(v.literal("out"), v.literal("in")),
    subject: v.string(),
    bodyText: v.string(),
    attachmentIds: v.array(v.id("_storage")),
    receivedAt: v.number(),
    processed: v.boolean(),
  })
    .index("by_project", ["projectId"])
    .index("by_thread", ["threadId"])
    .index("by_supplier", ["supplierId"])
    .index("by_provider_message_id", ["providerMessageId"]),

  quotes: defineTable({
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
  })
    .index("by_project", ["projectId"])
    .index("by_supplier", ["supplierId"])
    .index("by_message", ["messageId"]),

  quoteLines: defineTable({
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
  })
    .index("by_project", ["projectId"])
    .index("by_quote", ["quoteId"])
    .index("by_supplier", ["supplierId"])
    .index("by_project_line", ["projectId", "lineItemId"]),

  drafts: defineTable({
    projectId: v.id("projects"),
    supplierId: v.id("suppliers"),
    kind: v.union(
      v.literal("rfq"),
      v.literal("follow_up"),
      v.literal("counter"),
      v.literal("award"),
      v.literal("decline"),
    ),
    subject: v.string(),
    body: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("sent"),
      v.literal("discarded"),
    ),
  })
    .index("by_project", ["projectId"])
    .index("by_supplier", ["supplierId"]),

  events: defineTable({
    projectId: v.id("projects"),
    type: v.string(),
    payload: v.any(),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),
});
