"use node";

import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action } from "./_generated/server";
import { DRAFT_MODEL, structuredCall } from "./lib/llm";

const rfqDraftSchema = {
  type: "object",
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
  },
  required: ["subject", "body"],
  additionalProperties: false,
};

type RfqDraft = { subject: string; body: string };

function normalizeCategory(category: string): string {
  return category.trim().toLowerCase();
}

function replyByDate(): string {
  const date = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Public action: one pending RFQ draft per supplier marked status="selected",
// containing only the line items matching that supplier's categories.
// Ownership is enforced by routing through the existing ownership-checked
// projects.getProject/lineItems.listLineItems/suppliers.listSuppliers
// queries before drafting anything.
export const draftRfqs = action({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(api.projects.getProject, {
      projectId: args.projectId,
    });
    // Drafting RFQs is what moves a project into "sourcing" in practice, so
    // this is where the project's inbox gets provisioned if it doesn't
    // already have one (provisionInbox is itself idempotent).
    await ctx.runAction(api.inbox.provisionInbox, { projectId: args.projectId });
    const lineItems = await ctx.runQuery(api.lineItems.listLineItems, {
      projectId: args.projectId,
    });
    const suppliers = await ctx.runQuery(api.suppliers.listSuppliers, {
      projectId: args.projectId,
    });
    const existingDrafts = await ctx.runQuery(api.drafts.listDrafts, {
      projectId: args.projectId,
    });

    const selectedSuppliers = suppliers.filter((s) => s.status === "selected");
    const deadline = replyByDate();

    for (const supplier of selectedSuppliers) {
      const alreadyDrafted = existingDrafts.some(
        (d) => d.supplierId === supplier._id && d.kind === "rfq",
      );
      if (alreadyDrafted) {
        continue;
      }

      const supplierCategories = new Set(supplier.categories.map(normalizeCategory));
      const matchedItems = lineItems.filter((item) =>
        supplierCategories.has(normalizeCategory(item.category)),
      );
      if (matchedItems.length === 0) {
        continue;
      }

      const itemsList = matchedItems
        .map((item) => `- ${item.quantity} ${item.unit}: ${item.name} (${item.spec})`)
        .join("\n");

      const draft = await structuredCall<RfqDraft>({
        model: DRAFT_MODEL,
        schemaName: "rfq_draft",
        schema: rfqDraftSchema,
        system:
          "You are drafting a request-for-quote (RFQ) email on behalf of a " +
          "contractor, to be sent to a materials supplier. Write a concise, " +
          "professional email that: lists the specific materials needed " +
          "(name, spec, quantity, unit) exactly as given, nothing added or " +
          "removed; asks the supplier to reply with a unit price, lead time, " +
          "and delivery cost for each item; states the reply-by date given; " +
          "signs off with the project name. Do not invent items, prices, or " +
          "dates beyond what is given in the input.",
        input:
          `Project: ${project.name}\n` +
          `Location: ${project.location}\n` +
          `Supplier: ${supplier.name}\n` +
          `Reply by: ${deadline}\n\n` +
          `Items needed:\n${itemsList}`,
      });

      await ctx.runMutation(internal.drafts.insertDraft, {
        projectId: args.projectId,
        supplierId: supplier._id,
        kind: "rfq",
        subject: draft.subject,
        body: draft.body,
      });
    }
    return null;
  },
});
