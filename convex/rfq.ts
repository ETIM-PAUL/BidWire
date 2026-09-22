"use node";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action } from "./_generated/server";

function replyByDate(): string { return new Date(Date.now()+5*24*60*60*1000).toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"}); }
function norm(s:string):string { return s.trim().toLowerCase(); }
function buildBody(projectName:string, location:string, supplierName:string, deadline:string, items:Array<{name:string;spec:string;quantity:number;unit:string}>):string {
  const rows=items.map(i=>`- ${i.quantity} ${i.unit}: ${i.name} — ${i.spec}`).join("\n");
  return [`Dear ${supplierName},`,"",`Please provide a quotation for the following materials for ${projectName}. Delivery location: ${location}.`,"","Items required:",rows,"","For each item, please provide:","- Unit price","- Available quantity / confirmation of quantity","- Lead time","- Delivery cost","",`Please reply by ${deadline}.`,"",`Kind regards,\nBidWire — ${projectName}`].join("\n");
}

export const draftRfqs = action({
  args:{projectId:v.id("projects")}, returns:v.null(),
  handler:async(ctx,args)=>{
    const project=await ctx.runQuery(api.projects.getProject,{projectId:args.projectId});
    await ctx.runAction(api.inbox.provisionInbox,{projectId:args.projectId});
    const lineItems=await ctx.runQuery(api.lineItems.listLineItems,{projectId:args.projectId});
    const suppliers=await ctx.runQuery(api.suppliers.listSuppliers,{projectId:args.projectId});
    const existing=await ctx.runQuery(api.drafts.listDrafts,{projectId:args.projectId});
    const selected=suppliers.filter(s=>s.status==="selected"); const deadline=replyByDate();
    for(const supplier of selected){
      if(existing.some(d=>d.supplierId===supplier._id&&d.kind==="rfq")) continue;
      const cats=new Set(supplier.categories.map(norm));
      const matched=lineItems.filter(item=>cats.has(norm(item.category)));
      if(!matched.length) continue;
      const body=buildBody(project.name,project.location,supplier.name,deadline,matched);
      await ctx.runMutation(internal.drafts.insertDraft,{projectId:args.projectId,supplierId:supplier._id,kind:"rfq",subject:`Request for Quote: ${project.name}`,body,rfqLineItemIds:matched.map(item=>item._id)});
    }
    return null;
  }
});
