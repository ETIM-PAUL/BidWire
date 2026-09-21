"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, components, internal } from "./_generated/api";
import { AgentMail } from "@agentmail/convex";
import { PDFDocument, StandardFonts } from "pdf-lib";
const agentmail=new AgentMail(components.agentmail);

export const generateAwardDrafts=action({
 args:{projectId:v.id("projects"),awardId:v.id("awards")},
 returns:v.null(),
 handler:async(ctx,args)=>{
   const award=await ctx.runQuery(api.awards.getAward,{projectId:args.projectId});
   if(!award) throw new Error("Award not found");
   const preview=await ctx.runQuery(api.awards.getAwardPreview,{projectId:args.projectId});
   const suppliers=await ctx.runQuery(api.suppliers.listSuppliers,{projectId:args.projectId});
   const winners=new Set(preview.suppliers.map(s=>s.supplierId as string));
   for(const s of suppliers){
     const isWinner=winners.has(s._id as string);
     const rows=preview.rows.filter(r=>r.supplierId===s._id);
     const subject=isWinner?`Purchase order — ${rows.length} item(s)`:"Thank you for your quotation";
     const body=isWinner
       ? `Dear ${s.name},\\n\\nPlease find our purchase order for the following items:\\n\\n${rows.map(r=>`• ${r.name}: ${r.quantity} ${r.unit} @ ${r.unitPrice.toLocaleString()} ${(await ctx.runQuery(api.projects.getProject,{projectId:args.projectId})).currency}`).join("\\n")}\\n\\nDelivery address: ${award.deliveryAddress}\\nRequested delivery date: ${award.deliveryDate}\\n\\nPlease confirm receipt and expected delivery.\\n\\nThank you.`
       : `Dear ${s.name},\\n\\nThank you for taking the time to quote for this project. We have proceeded with another supplier for this order. We appreciate your quotation and hope to work with you on a future opportunity.\\n\\nKind regards.`;
     await ctx.runMutation(internal.awards.insertAwardDraft,{projectId:args.projectId,supplierId:s._id,awardId:args.awardId,kind:isWinner?"award":"decline",subject,body});
   }
   return null;
 }
});
