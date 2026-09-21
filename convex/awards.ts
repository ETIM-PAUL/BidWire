import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { AgentMail } from "@agentmail/convex";
import { components } from "./_generated/api";
import { requireProjectOwner } from "./lib/auth";

const agentmail = new AgentMail(components.agentmail);

function hintMatchesLineItem(itemHint: string, lineItemName: string): boolean {
  const nameWords = new Set(lineItemName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const hintWords = new Set(itemHint.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  if (nameWords.size === 0) return false;
  let overlap = 0;
  for (const word of nameWords) if (hintWords.has(word)) overlap++;
  return overlap / nameWords.size >= 0.5;
}

export const getAwardPreview = query({
  args: { projectId: v.id("projects") },
  returns: v.object({
    rows: v.array(v.object({
      lineItemId: v.id("lineItems"), name: v.string(), quantity: v.number(), unit: v.string(),
      supplierId: v.id("suppliers"), supplierName: v.string(), unitPrice: v.number(), total: v.number(),
    })),
    suppliers: v.array(v.object({ supplierId: v.id("suppliers"), supplierName: v.string(), total: v.number() })),
    totalSpend: v.number(), highestQuote: v.number(), publishedListTotal: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const items = await ctx.db.query("lineItems").withIndex("by_project", q => q.eq("projectId", args.projectId)).take(1000);
    const quotes = await ctx.db.query("quotes").withIndex("by_project", q => q.eq("projectId", args.projectId)).take(1000);
    const latest = new Map<string, any>();
    for (const q of quotes) {
      const old = latest.get(q.supplierId as string);
      if (!old || q.version > old.version) latest.set(q.supplierId as string, q);
    }
    const lines = await ctx.db.query("quoteLines").withIndex("by_project", q => q.eq("projectId", args.projectId)).take(5000);
    const suppliers = await ctx.db.query("suppliers").withIndex("by_project", q => q.eq("projectId", args.projectId)).take(500);
    const names = new Map(suppliers.map(s => [s._id as string, s.name]));
    const result:any[] = [];
    for (const item of items) {
      const candidates = lines.filter(l => l.lineItemId === item._id && latest.get(l.supplierId as string)?._id === l.quoteId);
      const best = candidates.sort((a,b) => a.unitPrice - b.unitPrice)[0];
      if (best) result.push({lineItemId:item._id,name:item.name,quantity:item.quantity,unit:item.unit,supplierId:best.supplierId,supplierName:names.get(best.supplierId as string) ?? "Supplier",unitPrice:best.unitPrice,total:best.unitPrice*item.quantity});
    }
    const supplierTotals = new Map<string,number>();
    for(const r of result) supplierTotals.set(r.supplierId as string,(supplierTotals.get(r.supplierId as string)??0)+r.total);
    const highest = [...latest.keys()].map(id => {
      const q=latest.get(id); return lines.filter(l=>l.quoteId===q._id).reduce((n,l)=>n+l.total,0)+(q.deliveryCost??0)
    }).sort((a,b)=>b-a)[0] ?? 0;
    const published = result.reduce((sum,r)=>{
      const s=suppliers.find(x=>x._id===r.supplierId);
      const lp=(s?.listPrices??[]).find(x=>hintMatchesLineItem(x.itemHint, r.name));
      return sum+(lp?.price??0)*r.quantity;
    },0);
    return {rows:result,suppliers:[...supplierTotals].map(([supplierId,total])=>({supplierId:supplierId as any,supplierName:names.get(supplierId)??"Supplier",total})),totalSpend:result.reduce((n,r)=>n+r.total,0),highestQuote:highest,publishedListTotal:published};
  },
});

export const awardProject = mutation({
  args:{projectId:v.id("projects"),mode:v.union(v.literal("single"),v.literal("split")),supplierId:v.optional(v.id("suppliers")),deliveryAddress:v.string(),deliveryDate:v.string(),quantities:v.array(v.object({lineItemId:v.id("lineItems"),quantity:v.number()}))},
  returns:v.id("awards"),
  handler:async(ctx,args)=>{
    await requireProjectOwner(ctx,args.projectId);
    const preview=await (async()=>{const items=await ctx.db.query("lineItems").withIndex("by_project",q=>q.eq("projectId",args.projectId)).take(1000);const quotes=await ctx.db.query("quotes").withIndex("by_project",q=>q.eq("projectId",args.projectId)).take(1000);const latest=new Map<string,any>();for(const q of quotes){const o=latest.get(q.supplierId as string);if(!o||q.version>o.version)latest.set(q.supplierId as string,q)}const lines=await ctx.db.query("quoteLines").withIndex("by_project",q=>q.eq("projectId",args.projectId)).take(5000);return {items,latest,lines}})();
    const suppliers=await ctx.db.query("suppliers").withIndex("by_project",q=>q.eq("projectId",args.projectId)).take(500);
    const highestQuote=[...preview.latest.values()].map(q=>preview.lines.filter(l=>l.quoteId===q._id && l.lineItemId).reduce((n,l)=>n+l.total,0)+(q.deliveryCost??0)).sort((a,b)=>b-a)[0]??0;
    const publishedListTotal=preview.items.reduce((sum,item)=>{
      const matches=suppliers.flatMap(s=>(s.listPrices??[]).filter(lp=>hintMatchesLineItem(lp.itemHint, item.name)));
      const price=matches.sort((a,b)=>a.price-b.price)[0]?.price;
      return sum+(price??0)*item.quantity;
    },0);
    const awardId=await ctx.db.insert("awards",{projectId:args.projectId,mode:args.mode,deliveryAddress:args.deliveryAddress,deliveryDate:args.deliveryDate,totalSpend:0,highestQuote,publishedListTotal,awardedAt:Date.now()});
    let total=0;
    for(const item of preview.items){
      const candidates=preview.lines.filter(l=>l.lineItemId===item._id && preview.latest.get(l.supplierId as string)?._id===l.quoteId).sort((a,b)=>a.unitPrice-b.unitPrice);
      const best=args.mode==="single"
        ? candidates.find(x=>x.supplierId===args.supplierId)
        : candidates[0];
      if(!best) throw new Error(`No quote for ${item.name} from the selected supplier`);
      const confirmedQuantity=args.quantities.find(q=>q.lineItemId===item._id)?.quantity ?? item.quantity;
      if(!Number.isFinite(confirmedQuantity) || confirmedQuantity < 0) throw new Error(`Invalid quantity for ${item.name}`);
      const lineTotal=best.unitPrice*confirmedQuantity; total+=lineTotal;
      await ctx.db.insert("awardLines",{awardId,projectId:args.projectId,supplierId:best.supplierId,lineItemId:item._id,quantity:confirmedQuantity,unit:item.unit,unitPrice:best.unitPrice,total:lineTotal});
    }
    const winningSuppliers=new Set<string>();
    for(const line of await ctx.db.query("awardLines").withIndex("by_award",q=>q.eq("awardId",awardId)).take(5000)) winningSuppliers.add(line.supplierId as string);
    for(const supplierId of winningSuppliers) total += preview.latest.get(supplierId)?.deliveryCost ?? 0;
    await ctx.db.patch(awardId,{totalSpend:total});
    await ctx.db.patch(args.projectId,{status:"awarded",awardId,awardedAt:Date.now()});
    await ctx.db.insert("events",{projectId:args.projectId,type:"project_awarded",payload:{awardId,mode:args.mode,totalSpend:total},createdAt:Date.now()});
    return awardId;
  }
});

export const getAward = query({
  args:{projectId:v.id("projects")},
  returns:v.union(v.object({awardId:v.id("awards"),mode:v.union(v.literal("single"),v.literal("split")),deliveryAddress:v.string(),deliveryDate:v.string(),totalSpend:v.number(),highestQuote:v.number(),publishedListTotal:v.number(),awardedAt:v.number()}),v.null()),
  handler:async(ctx,args)=>{await requireProjectOwner(ctx,args.projectId);const a=await ctx.db.query("awards").withIndex("by_project",q=>q.eq("projectId",args.projectId)).order("desc").first();return a?{awardId:a._id,mode:a.mode,deliveryAddress:a.deliveryAddress,deliveryDate:a.deliveryDate,totalSpend:a.totalSpend,highestQuote:a.highestQuote,publishedListTotal:a.publishedListTotal,awardedAt:a.awardedAt}:null}
});

export const insertAwardDraft = internalMutation({
  args:{projectId:v.id("projects"),supplierId:v.id("suppliers"),awardId:v.id("awards"),kind:v.union(v.literal("award"),v.literal("decline")),subject:v.string(),body:v.string(),attachmentId:v.optional(v.id("_storage"))},
  returns:v.null(),
  handler:async(ctx,args)=>{await ctx.db.insert("drafts",{projectId:args.projectId,supplierId:args.supplierId,kind:args.kind,subject:args.subject,body:args.body,status:"pending",attachmentId:args.attachmentId});return null;}
});

export const sendAwardDraft = mutation({
  args:{draftId:v.id("drafts")},
  returns:v.object({ok:v.boolean(),blockedReason:v.optional(v.string())}),
  handler:async(ctx,args)=>{
    const draft=await ctx.db.get(args.draftId); if(!draft) throw new Error("Draft not found");
    await requireProjectOwner(ctx,draft.projectId);
    if(draft.status!=="pending" || (draft.kind!=="award" && draft.kind!=="decline")) throw new Error("Draft is not sendable");
    const supplier=await ctx.db.get(draft.supplierId); const project=await ctx.db.get(draft.projectId);
    if(!supplier?.email || !project?.inboxId) throw new Error("Supplier email or project inbox is missing");
    if(process.env.DEMO_MODE==="true"){
      const allow=(process.env.DEMO_ALLOWLIST??"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
      if(!allow.includes(supplier.email.toLowerCase())){
        const reason=`DEMO_MODE is on: ${supplier.email} is not on the allowlist. Refusing to send.`;
        await ctx.db.insert("events",{projectId:draft.projectId,type:"award_send_blocked",payload:{supplierId:draft.supplierId,email:supplier.email,reason},createdAt:Date.now()});
        return {ok:false,blockedReason:reason};
      }
    }
    const msg:any={to:supplier.email,subject:draft.subject,text:draft.body};
    if(draft.attachmentId){
      const blob=await ctx.storage.get(draft.attachmentId);
      if(blob){ const bytes=new Uint8Array(await blob.arrayBuffer()); let bin=""; for(const b of bytes) bin+=String.fromCharCode(b); msg.attachments=[{content:btoa(bin),filename:"purchase-order.html",content_type:"text/html"}]; }
    }
    const outboundId=await agentmail.sendMessage(ctx,project.inboxId,msg);
    await ctx.db.patch(args.draftId,{status:"sent"});
    await ctx.db.insert("messages",{projectId:draft.projectId,supplierId:draft.supplierId,providerMessageId:outboundId,direction:"out",subject:draft.subject,bodyText:draft.body,attachmentIds:draft.attachmentId?[draft.attachmentId]:[],receivedAt:Date.now(),processed:true});
    await ctx.db.insert("events",{projectId:draft.projectId,type:draft.kind==="award"?"po_sent":"decline_sent",payload:{supplierId:draft.supplierId},createdAt:Date.now()});
    return {ok:true};
  }
});

export const getAwardLines = query({
  args:{awardId:v.id("awards")},
  returns:v.array(v.object({supplierId:v.id("suppliers"),lineItemId:v.id("lineItems"),name:v.string(),quantity:v.number(),unit:v.string(),unitPrice:v.number(),total:v.number()})),
  handler:async(ctx,args)=>{
    const award=await ctx.db.get(args.awardId); if(!award) throw new Error("Award not found");
    await requireProjectOwner(ctx,award.projectId);
    const lines=await ctx.db.query("awardLines").withIndex("by_award",q=>q.eq("awardId",args.awardId)).take(5000);
    const items=await ctx.db.query("lineItems").withIndex("by_project",q=>q.eq("projectId",award.projectId)).take(1000);
    const names=new Map(items.map(i=>[i._id as string,i.name]));
    return lines.map(l=>({supplierId:l.supplierId,lineItemId:l.lineItemId,name:names.get(l.lineItemId as string)??"Item",quantity:l.quantity,unit:l.unit,unitPrice:l.unitPrice,total:l.total}));
  }
});
