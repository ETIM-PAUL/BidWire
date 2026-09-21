import { useAction, useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'

export function AwardPanel({ project }: { project: Doc<'projects'> }) {
  const preview=useQuery(api.awards.getAwardPreview,{projectId:project._id})
  const drafts=useQuery(api.drafts.listDrafts,{projectId:project._id})
  const award=useMutation(api.awards.awardProject)
  const generate=useAction(api.awardDrafts.generateAwardDrafts)
  const send=useMutation(api.awards.sendAwardDraft)
  const updateDraft=useMutation(api.drafts.updateDraft)
  const [mode,setMode]=useState<'single'|'split'>('single')
  const [supplierId,setSupplierId]=useState<Id<'suppliers'>|''>('')
  const [address,setAddress]=useState(project.location)
  const [date,setDate]=useState('')
  const [quantities,setQuantities]=useState<Record<string,number>>({})
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState<string|null>(null)

  if(!preview) return <p className="text-sm text-neutral-500">Loading award…</p>

  const selectedRows=mode==='single' && supplierId
    ? preview.rows.filter(r=>r.supplierId===supplierId)
    : preview.rows
  const pending=drafts?.filter(d=>(d.kind==='award'||d.kind==='decline')&&d.status==='pending')??[]

  async function confirmAward(){
    setBusy(true);setError(null)
    try{
      if(mode==='single'&&!supplierId){setError('Choose a supplier for a single-supplier order.');return}
      if(selectedRows.length===0){setError('No quoted items are available for this award.');return}
      const id=await award({
        projectId:project._id,mode,supplierId:mode==='single'?supplierId as Id<'suppliers'>:undefined,
        deliveryAddress:address,deliveryDate:date,
        quantities:preview.rows.map(r=>({lineItemId:r.lineItemId,quantity:quantities[r.lineItemId as string]??r.quantity}))
      })
      await generate({projectId:project._id,awardId:id})
    }catch(e){setError(e instanceof Error?e.message:'Could not create award.')}finally{setBusy(false)}
  }

  return <div className="space-y-4 border-t border-neutral-800 pt-5">
    <div>
      <h2 className="text-base font-semibold">Award & purchase orders</h2>
      <p className="text-xs text-neutral-500">Confirm quantities and delivery details before generating approval drafts.</p>
    </div>
    <div className="flex gap-2">
      {(['single','split'] as const).map(m=><button key={m} onClick={()=>setMode(m)} className={`px-3 py-1.5 rounded border text-sm ${mode===m?'bg-neutral-100 text-neutral-900':'border-neutral-800 text-neutral-400'}`}>{m==='single'?'Single supplier':'Split order'}</button>)}
    </div>
    {mode==='single'&&<select value={supplierId} onChange={e=>setSupplierId(e.target.value as Id<'suppliers'>)} className="bg-neutral-900 border border-neutral-800 rounded px-2 py-2 text-sm w-full"><option value="">Choose supplier…</option>{preview.suppliers.map(s=><option key={s.supplierId} value={s.supplierId}>{s.supplierName}</option>)}</select>}
    <div className="grid sm:grid-cols-2 gap-3">
      <label className="text-xs text-neutral-500">Delivery address<input value={address} onChange={e=>setAddress(e.target.value)} className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-2 text-sm text-neutral-200"/></label>
      <label className="text-xs text-neutral-500">Delivery date<input type="date" value={date} onChange={e=>setDate(e.target.value)} className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-2 text-sm text-neutral-200"/></label>
    </div>
    <div className="rounded border border-neutral-800 divide-y divide-neutral-900">
      {selectedRows.map(r=><div key={r.lineItemId} className="p-3 flex items-center gap-3 text-sm"><span className="flex-1">{r.name}<span className="block text-xs text-neutral-600">{r.supplierName} · {r.unitPrice.toLocaleString()} {project.currency}/{r.unit}</span></span><input type="number" min="0" step="any" value={quantities[r.lineItemId as string]??r.quantity} onChange={e=>setQuantities(q=>({...q,[r.lineItemId as string]:Number(e.target.value)}))} className="w-24 bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-right"/><span className="text-neutral-500 w-24 text-right">{(r.unitPrice*(quantities[r.lineItemId as string]??r.quantity)).toLocaleString()} {project.currency}</span></div>)}
    </div>
    <button disabled={busy} onClick={()=>void confirmAward()} className="rounded-md bg-neutral-100 text-neutral-900 px-4 py-2 text-sm font-medium disabled:opacity-50">{busy?'Preparing…':'Confirm award & create drafts'}</button>
    {error&&<p className="text-sm text-red-400">{error}</p>}
    {pending.length>0&&<div className="space-y-3"><h3 className="text-sm font-medium">Approval queue ({pending.length})</h3>{pending.map(d=><div key={d._id} className="border border-neutral-800 rounded p-3"><div className="flex justify-between gap-3"><div><p className="text-sm font-medium">{d.kind==='award'?'Purchase order':'Decline'}</p><p className="text-xs text-neutral-500">{d.subject}</p></div><button onClick={()=>void send({draftId:d._id})} className="text-xs bg-neutral-100 text-neutral-900 rounded px-2 py-1">Approve & send</button></div><textarea defaultValue={d.body} onBlur={e=>void updateDraft({draftId:d._id,body:e.currentTarget.value})} rows={5} className="mt-2 w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-sm"/></div>)}</div>}
  </div>
}
