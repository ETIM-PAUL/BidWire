"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

type AwardLine = {
  supplierId: Id<"suppliers">;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
};

export const generateAwardDrafts = action({
  args: { projectId: v.id("projects"), awardId: v.id("awards") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const award = await ctx.runQuery(api.awards.getAward, { projectId: args.projectId });
    if (!award) throw new Error("Award not found");
    const awardLines = (await ctx.runQuery(api.awards.getAwardLines, { awardId: args.awardId })) as AwardLine[];
    const project = await ctx.runQuery(api.projects.getProject, { projectId: args.projectId });
    const suppliers = await ctx.runQuery(api.suppliers.listSuppliers, { projectId: args.projectId });
    const winners = new Set(awardLines.map((r) => r.supplierId as string));
    for (const supplier of suppliers) {
      if (typeof supplier.email !== "string" || supplier.email.trim() === "") continue;
      const isWinner = winners.has(supplier._id as string);
      const rows = awardLines.filter((r) => r.supplierId === supplier._id);
      const subject = isWinner ? "Purchase order — " + rows.length + " item(s)" : "Thank you for your quotation";
      const body = isWinner
        ? "Dear " + supplier.name + ",\n\nPlease find our purchase order for the following items:\n\n" +
          rows.map((r) => "• " + r.name + ": " + r.quantity + " " + r.unit + " @ " + r.unitPrice.toLocaleString() + " " + project.currency).join("\n") +
          "\n\nDelivery address: " + award.deliveryAddress + "\nRequested delivery date: " + award.deliveryDate + "\n\nPlease confirm receipt and expected delivery.\n\nThank you."
        : "Dear " + supplier.name + ",\n\nThank you for taking the time to quote for this project. We have proceeded with another supplier for this order. We appreciate your quotation and hope to work with you on a future opportunity.\n\nKind regards.";
      let attachmentId: any = undefined;
      let attachmentContent: string | undefined = undefined;
      if (isWinner) {
        const html = "<!doctype html><html><head><meta charset=\"utf-8\"><title>Purchase Order</title><style>body{font-family:Arial,sans-serif;margin:40px;color:#222}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}.total{font-weight:bold}</style></head><body>" +
          "<h1>Purchase Order</h1><h2>" + project.name + "</h2><p><b>Supplier:</b> " + supplier.name + "<br><b>Delivery:</b> " + award.deliveryAddress + "<br><b>Date:</b> " + award.deliveryDate + "</p>" +
          "<table><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Agreed price</th><th>Total</th></tr>" +
          rows.map((r) => "<tr><td>" + r.name + "</td><td>" + r.quantity + "</td><td>" + r.unit + "</td><td>" + r.unitPrice.toLocaleString() + " " + project.currency + "</td><td>" + r.total.toLocaleString() + " " + project.currency + "</td></tr>").join("") +
          "</table><p class=\"total\">Order total: " + rows.reduce((n, r) => n + r.total, 0).toLocaleString() + " " + project.currency + "</p></body></html>";
        attachmentId = await ctx.storage.store(new Blob([html], { type: "text/html" }));
        attachmentContent = Buffer.from(html, "utf8").toString("base64");
      }
      await ctx.runMutation(internal.awards.insertAwardDraft, { projectId: args.projectId, supplierId: supplier._id, awardId: args.awardId, kind: isWinner ? "award" : "decline", subject, body, attachmentId, attachmentContent });
    }
    return null;
  },
});
