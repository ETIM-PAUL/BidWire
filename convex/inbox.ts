import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action } from "./_generated/server";

type InboxResponse={inbox_id:string;email:string}; type ListedInbox=InboxResponse&{display_name?:string};
async function listInboxesDirect():Promise<ListedInbox[]> { const apiKey=process.env.AGENTMAIL_API_KEY; if(!apiKey) throw new Error("AGENTMAIL_API_KEY is not set on this Convex deployment."); const baseUrl=process.env.AGENTMAIL_BASE_URL??"https://api.agentmail.to/v0"; const r=await fetch(`${baseUrl}/inboxes?limit=100`,{headers:{Authorization:`Bearer ${apiKey}`}}); if(!r.ok) throw new Error(`AgentMail inbox list failed ${r.status}: ${(await r.text()).slice(0,500)}`); const data=await r.json() as {inboxes?:ListedInbox[]}; return data.inboxes??[]; }
async function createInboxDirect(request:{username?:string;display_name?:string}):Promise<InboxResponse>{ const apiKey=process.env.AGENTMAIL_API_KEY; if(!apiKey) throw new Error("AGENTMAIL_API_KEY is not set on this Convex deployment."); const baseUrl=process.env.AGENTMAIL_BASE_URL??"https://api.agentmail.to/v0"; const r=await fetch(`${baseUrl}/inboxes`,{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify(request)}); if(!r.ok) throw new Error(`AgentMail API error ${r.status}: ${(await r.text()).slice(0,500)}`); return r.json(); }
async function resolveDemoInbox():Promise<{inbox:ListedInbox;all:ListedInbox[]}>{ const all=await listInboxesDirect(); const configured=process.env.DEMO_SHARED_INBOX_ID?.trim(); if(configured){const inbox=all.find(x=>x.inbox_id===configured); if(!inbox) throw new Error(`DEMO_SHARED_INBOX_ID ${configured} was not found.`); return {inbox,all};} if(all.length) return {inbox:all[0],all}; const inbox=await createInboxDirect({username:"bidwire-demo",display_name:"BidWire Demo"}); return {inbox,all:[inbox]}; }

export const provisionInbox=action({
  args:{projectId:v.id("projects")}, returns:v.null(),
  handler:async(ctx,args)=>{
    const project=await ctx.runQuery(api.projects.getProject,{projectId:args.projectId});
    let inbox:InboxResponse; let available:ListedInbox[]=[];
    if(project.inboxId){ inbox={inbox_id:project.inboxId,email:project.inboxAddress??""}; if(process.env.DEMO_MODE==="true") available=await listInboxesDirect(); }
    else if(process.env.DEMO_MODE==="true"){const resolved=await resolveDemoInbox(); inbox=resolved.inbox; available=resolved.all; await ctx.runMutation(internal.projects.setInbox,{projectId:args.projectId,inboxId:inbox.inbox_id,inboxAddress:inbox.email});}
    else { const shortId=args.projectId.slice(-8); inbox=await createInboxDirect({username:`bidwire-${shortId}`,display_name:project.name}); await ctx.runMutation(internal.projects.setInbox,{projectId:args.projectId,inboxId:inbox.inbox_id,inboxAddress:inbox.email}); }
    if(process.env.DEMO_MODE==="true"){
      if(!available.length) available=await listInboxesDirect();
      const configured=(process.env.DEMO_ALLOWLIST??"").split(",").map(x=>x.trim()).filter(Boolean).filter(x=>x.toLowerCase()!==inbox.email.toLowerCase());
      const availableSupplierEmails=available.map(x=>x.email).filter(x=>x.toLowerCase()!==inbox.email.toLowerCase());
      const pool=configured.length?configured:availableSupplierEmails;
      await ctx.runMutation(internal.suppliers.assignDemoSupplierEmails,{projectId:args.projectId,emails:pool});
    }
    return null;
  }
});
