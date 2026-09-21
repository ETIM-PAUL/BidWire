import { useAction, useQuery } from 'convex/react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

const scenarios=[['prose_quote','Prose quote'],['pdf_quote','PDF quote'],['decline','Decline'],['revised_price','Revised price']] as const

export function SimulatorPage(){
  const admin=useQuery(api.suppliers.isDemoAdmin)
  const projects=useQuery(api.projects.listMyProjects)
  const [projectId,setProjectId]=useState<Id<'projects'>|''>('')
  const suppliers=useQuery(api.suppliers.listDemoSuppliers,projectId?{projectId}: 'skip')
  const send=useAction(api.suppliers.simulatorReplies)
  const [busy,setBusy]=useState<string|null>(null)
  const [message,setMessage]=useState<string|null>(null)

  if(admin===false) return <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6"><Link to="/" className="text-sm text-neutral-400">← Projects</Link><div className="max-w-xl mx-auto mt-16 rounded-lg border border-red-900 bg-red-950/20 p-6"><h1 className="font-semibold">Admin access required</h1><p className="text-sm text-neutral-400 mt-2">The supplier simulator is restricted to configured demo administrators.</p></div></div>
  if(admin===undefined) return <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6">Loading…</div>
  return <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4 sm:p-6">
    <header className="max-w-4xl mx-auto flex items-center justify-between"><div><Link to="/" className="text-sm text-neutral-400">← Projects</Link><h1 className="text-xl font-semibold mt-2">Supplier simulator</h1><p className="text-sm text-neutral-500">Replies are sent through the real AgentMail inbox.</p></div></header>
    <main className="max-w-4xl mx-auto mt-6 space-y-4">
      <select value={projectId} onChange={e=>setProjectId(e.target.value as Id<'projects'>)} className="w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2"><option value="">Choose project…</option>{projects?.map(p=><option key={p._id} value={p._id}>{p.name}</option>)}</select>
      {!projectId&&<div className="rounded-lg border border-neutral-800 p-6 text-sm text-neutral-500">Choose a project to see its demo supplier inboxes.</div>}
      {suppliers?.map(s=><div key={s._id} className="rounded-lg border border-neutral-800 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{s.name}</p><p className="text-xs text-neutral-600">{s.email??'No inbox configured'}</p></div><span className="text-xs text-neutral-500">{s.status}</span></div><div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">{scenarios.map(([key,label])=><button key={key} disabled={!!busy||!s.email} onClick={async()=>{setBusy(s._id+key);setMessage(null);try{await send({projectId:projectId as Id<'projects'>,supplierId:s._id,scenario:key});setMessage(label+' sent from '+s.name)}catch(e){setMessage(e instanceof Error?e.message:'Could not send')}finally{setBusy(null)}}} className="rounded border border-neutral-700 px-2 py-2 text-xs hover:bg-neutral-900 disabled:opacity-40">{busy===s._id+key?'Sending…':label}</button>)}</div></div>)}
      {message&&<div role="status" className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-300">{message}</div>}
    </main>
  </div>
}
