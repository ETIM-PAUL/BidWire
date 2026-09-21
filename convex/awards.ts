import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { AgentMail } from "@agentmail/convex";
import { components } from "./_generated/api";
import { requireProjectOwner } from "./lib/auth";

const agentmail = new AgentMail(components.agentmail);

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
      const lp=(s?.listPrices??[]).find(x=>x.itemHint.toLowerCase().includes(r.name.toLowerCase()) || r.name.toLowerCase().includes(x.itemHint.toLowerCase()));
      return sum+(lp?.price??0)*r.quantity;
    },0);
    return {rows:result,suppliers:[...supplierTotals].map(([supplierId,total])=>({supplierId:supplierId as any,supplierName:names.get(supplierId)??"Supplier",total})),totalSpend:result.reduce((n,r)=>n+r.total,0),highestQuote:highest,publishedListTotal:published};
  },
});

export const awardProject = mutation({
  args:{projectId:v.id("projects"),mode:v.union(v.literal("single"),v.literal("split")),deliveryAddress:v.string(),deliveryDate:v.string()},
  returns:v.id("awards"),
  handler:async(ctx,args)=>{
    await requireProjectOwner(ctx,args.projectId);
    const preview=await (async()=>{const items=await ctx.db.query("lineItems").withIndex("by_project",q=>q.eq("projectId",args.projectId)).take(1000);const quotes=await ctx.db.query("quotes").withIndex("by_project",q=>q.eq("projectId",args.projectId)).take(1000);const latest=new Map<string,any>();for(const q of quotes){const o=latest.get(q.supplierId as string);if(!o||q.version>o.version)latest.set(q.supplierId as string,q)}const lines=await ctx.db.query("quoteLines").withIndex("by_project",q=>q.eq("projectId",args.projectId)).take(5000);return {items,latest,lines}})();
    const awardId=await ctx.db.insert("awards",{projectId:args.projectId,mode:args.mode,deliveryAddress:args.deliveryAddress,deliveryDate:args.deliveryDate,totalSpend:0,highestQuote:0,publishedListTotal:0,awardedAt:Date.now()});
    let total=0;
    for(const item of preview.items){
      const candidates=preview.lines.filter(l=>l.lineItemId===item._id && preview.latest.get(l.supplierId as string)?._id===l.quoteId).sort((a,b)=>a.unitPrice-b.unitPrice);
      const best=candidates[0]; if(!best) continue;
      const lineTotal=best.unitPrice*item.quantity; total+=lineTotal;
      await ctx.db.insert("awardLines",{awardId,projectId:args.projectId,supplierId:best.supplierId,lineItemId:item._id,quantity:item.quantity,unit:item.unit,unitPrice:best.unitPrice,total:lineTotal});
    }
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
