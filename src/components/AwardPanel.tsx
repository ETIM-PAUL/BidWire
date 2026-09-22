import { useAction, useMutation, useQuery } from 'convex/react'
import { useEffect, useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { useToast } from './ui'

export function AwardPanel({ project }: { project: Doc<'projects'> }) {
  const preview = useQuery(api.awards.getAwardPreview, { projectId: project._id })
  const drafts = useQuery(api.drafts.listDrafts, { projectId: project._id })
  const savedAward = useQuery(api.awards.getAward, { projectId: project._id })
  const award = useMutation(api.awards.awardProject)
  const generate = useAction(api.awardDrafts.generateAwardDrafts)
  const send = useMutation(api.awards.sendAwardDraft)
  const updateDraft = useMutation(api.drafts.updateDraft)
  const { toast } = useToast()
  const [mode, setMode] = useState<'single' | 'split'>('single')
  const [supplierId, setSupplierId] = useState<Id<'suppliers'> | ''>('')
  const [address, setAddress] = useState(project.location)
  const [date, setDate] = useState('')
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openDraftId, setOpenDraftId] = useState<Id<'drafts'> | null>(null)
  const [autoOpened, setAutoOpened] = useState(false)
  const pending = drafts?.filter(d => (d.kind === 'award' || d.kind === 'decline') && d.status === 'pending') ?? []
  const selectedDraft = pending.find(d => d._id === openDraftId) ?? null

  useEffect(() => {
    if (savedAward && pending.length > 0 && !autoOpened) {
      const first = pending.find(d => d.kind === 'award') ?? pending[0]
      setOpenDraftId(first._id)
      setAutoOpened(true)
    }
  }, [savedAward, pending, autoOpened])

  if (preview === undefined) return <div className="animate-pulse rounded-2xl border border-white/10 p-5"><div className="h-5 w-48 rounded bg-white/10"/><div className="mt-4 h-20 rounded bg-white/5"/></div>

  if (savedAward) return <div className="space-y-4 border-t border-white/10 pt-5">
    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4"><p className="text-emerald-400 text-sm font-medium">Project awarded</p><div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm"><div><p className="text-xs text-neutral-500">Total spend</p><p className="text-neutral-200 font-medium">{savedAward.totalSpend.toLocaleString()} {project.currency}</p></div><div><p className="text-xs text-neutral-500">Savings vs highest quote</p><p className="text-neutral-200 font-medium">{Math.max(0, savedAward.highestQuote - savedAward.totalSpend).toLocaleString()} {project.currency}</p></div><div><p className="text-xs text-neutral-500">Savings vs published</p><p className="text-neutral-200 font-medium">{Math.max(0, savedAward.publishedListTotal - savedAward.totalSpend).toLocaleString()} {project.currency}</p></div><div><p className="text-xs text-neutral-500">Time to award</p><p className="text-neutral-200 font-medium">{Math.round((savedAward.awardedAt - project.createdAt) / 3600000)}h</p></div></div></div>
    {pending.length > 0 ? <div className="rounded-2xl border border-white/10 bg-white/[.02] p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Award emails ready</h3><p className="text-xs text-neutral-500 mt-1">Review each email before it is sent. Nothing is sent automatically.</p></div><button onClick={() => setOpenDraftId((pending.find(d => d.kind === 'award') ?? pending[0])._id)} className="bidwire-button bidwire-button-primary text-xs">Review &amp; send</button></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{pending.map(d => <button key={d._id} onClick={() => setOpenDraftId(d._id)} className="rounded-xl border border-white/10 p-3 text-left hover:border-white/20 transition"><p className="text-sm font-medium">{d.kind === 'award' ? 'Purchase order' : 'Supplier notification'}</p><p className="text-xs text-neutral-500 truncate mt-1">{d.subject}</p></button>)}</div></div> : <div className="rounded-xl border border-white/10 p-4 text-sm text-neutral-500">All award emails have been sent.</div>}
    {selectedDraft && <AwardEmailModal draft={selectedDraft} pending={pending} onClose={() => setOpenDraftId(null)} onSelect={setOpenDraftId} send={send} updateDraft={updateDraft} />}
  </div>

  const awardPreview = preview
  const selectedRows = mode === 'single' && supplierId ? awardPreview.supplierRows.filter(r => r.supplierId === supplierId) : awardPreview.rows
  const selectedMissing = mode === 'single' && supplierId ? awardPreview.missingBySupplier.find(s => s.supplierId === supplierId)?.missingLineItemIds.length ?? 0 : Math.max(0, awardPreview.scopeLineItemIds.length - awardPreview.rows.length)
  const ready = awardPreview.scopeLineItemIds.length > 0 && selectedMissing === 0 && !!address.trim() && !!date && (mode === 'split' || !!supplierId)

  async function confirmAward() {
    setBusy(true); setError(null)
    try {
      if (!ready) { setError(selectedMissing ? `Not ready: ${selectedMissing} RFQ item${selectedMissing === 1 ? '' : 's'} still has no valid quote for this award.` : 'Complete the award readiness checks before confirming.'); return }
      const id = await award({ projectId: project._id, mode, supplierId: mode === 'single' ? supplierId as Id<'suppliers'> : undefined, deliveryAddress: address, deliveryDate: date, quantities: awardPreview.scopeLineItemIds.map(lineItemId => ({ lineItemId, quantity: quantities[lineItemId as string] ?? selectedRows.find(r => r.lineItemId === lineItemId)?.quantity ?? 0 })) })
      await generate({ projectId: project._id, awardId: id })
      toast('success', 'Award created', 'Email drafts are ready for your review.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create award.'); toast('error', 'Award could not be created', e instanceof Error ? e.message : 'Please review the readiness checks.') }
    finally { setBusy(false) }
  }

  return <div className="space-y-4 border-t border-white/10 pt-5">
    <div><h2 className="text-base font-semibold">Award &amp; purchase orders</h2><p className="text-xs text-neutral-500">Only items actually included in sent RFQs are considered for award.</p></div>
    <div className="grid gap-2 sm:grid-cols-3"><div className={`rounded-xl border p-3 ${awardPreview.scopeLineItemIds.length ? 'border-emerald-500/20 bg-emerald-500/[.04]' : 'border-red-500/20 bg-red-500/[.04]'}`}><p className="text-[11px] uppercase tracking-wider text-neutral-500">RFQ scope</p><p className="mt-1 text-sm font-semibold">{awardPreview.scopeLineItemIds.length} items</p></div><div className={`rounded-xl border p-3 ${selectedMissing === 0 ? 'border-emerald-500/20 bg-emerald-500/[.04]' : 'border-amber-500/20 bg-amber-500/[.04]'}`}><p className="text-[11px] uppercase tracking-wider text-neutral-500">Quote coverage</p><p className="mt-1 text-sm font-semibold">{Math.max(0, awardPreview.scopeLineItemIds.length - selectedMissing)} / {awardPreview.scopeLineItemIds.length}</p></div><div className={`rounded-xl border p-3 ${address.trim() && date ? 'border-emerald-500/20 bg-emerald-500/[.04]' : 'border-amber-500/20 bg-amber-500/[.04]'}`}><p className="text-[11px] uppercase tracking-wider text-neutral-500">Delivery details</p><p className="mt-1 text-sm font-semibold">{address.trim() && date ? 'Ready' : 'Missing'}</p></div></div>
    <div className="flex gap-2"><button onClick={() => setMode('single')} className={`px-3 py-1.5 rounded-xl border text-sm ${mode === 'single' ? 'bg-white text-black border-white' : 'border-white/10 text-neutral-400'}`}>Single supplier</button><button onClick={() => setMode('split')} className={`px-3 py-1.5 rounded-xl border text-sm ${mode === 'split' ? 'bg-white text-black border-white' : 'border-white/10 text-neutral-400'}`}>Split order</button></div>
    {mode === 'single' && <select value={supplierId} onChange={e => setSupplierId(e.target.value as Id<'suppliers'>)} className="bg-neutral-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm w-full"><option value="">Choose supplier…</option>{awardPreview.suppliers.map(s => <option key={s.supplierId} value={s.supplierId}>{s.supplierName}</option>)}</select>}
    {mode === 'single' && supplierId && selectedMissing > 0 && <div className="rounded-xl border border-amber-500/20 bg-amber-500/[.05] p-3 text-sm text-amber-300">This supplier is missing {selectedMissing} item{selectedMissing === 1 ? '' : 's'} from the sent RFQ. Request a revised quote before awarding.</div>}
    {mode === 'split' && selectedMissing > 0 && <div className="rounded-xl border border-amber-500/20 bg-amber-500/[.05] p-3 text-sm text-amber-300">{selectedMissing} RFQ item{selectedMissing === 1 ? '' : 's'} has no supplier quote. The split award is not ready.</div>}
    <div className="grid sm:grid-cols-2 gap-3"><label className="text-xs text-neutral-500">Delivery address<input value={address} onChange={e => setAddress(e.target.value)} className="mt-1 w-full bg-neutral-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-neutral-200"/></label><label className="text-xs text-neutral-500">Delivery date<input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 w-full bg-neutral-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-neutral-200"/></label></div>
    <div className="rounded-xl border border-white/10 divide-y divide-white/[.05]">{selectedRows.map(r => <div key={r.lineItemId} className="p-3 flex items-center gap-3 text-sm"><span className="flex-1">{r.name}<span className="block text-xs text-neutral-600">{r.supplierName} · {r.unitPrice.toLocaleString()} {r.unit}</span></span><input type="number" min="0" step="any" value={quantities[r.lineItemId as string] ?? r.quantity} onChange={e => setQuantities(q => ({ ...q, [r.lineItemId as string]: Number(e.target.value) }))} className="w-24 bg-neutral-900 border border-white/10 rounded-lg px-2 py-1 text-right"/><span className="text-neutral-500 w-24 text-right">{(r.unitPrice * (quantities[r.lineItemId as string] ?? r.quantity)).toLocaleString()} {project.currency}</span></div>)}</div>
    <button disabled={busy || !ready} onClick={() => void confirmAward()} className="rounded-xl bg-white text-black px-4 py-2.5 text-sm font-medium disabled:opacity-40">{busy ? 'Preparing…' : ready ? 'Confirm award & create drafts' : 'Resolve readiness checks'}</button>
    {error && <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/[.05] p-3 text-sm text-red-300">{error}</div>}
  </div>
}

function AwardEmailModal({ draft, pending, onClose, onSelect, send, updateDraft }: { draft: Doc<'drafts'>; pending: Doc<'drafts'>[]; onClose: () => void; onSelect: (id: Id<'drafts'>) => void; send: (args: { draftId: Id<'drafts'> }) => Promise<{ ok: boolean; blockedReason?: string }>; updateDraft: (args: { draftId: Id<'drafts'>; body: string }) => Promise<null> }) {
  const [body, setBody] = useState(draft.body)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const { toast } = useToast()
  useEffect(() => { setBody(draft.body); setMessage(null) }, [draft._id, draft.body])
  async function handleSend() { setSending(true); setMessage(null); try { await updateDraft({ draftId: draft._id, body }); const result = await send({ draftId: draft._id }); if (!result.ok) { setMessage(result.blockedReason ?? 'The email was not sent.'); return } toast('success', 'Email sent', 'The supplier notification was sent through AgentMail.'); const next = pending.find(d => d._id !== draft._id); if (next) onSelect(next._id); else onClose() } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not send email.') } finally { setSending(false) } }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="award-email-title"><div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-[#0b0e0c] shadow-2xl"><div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><h3 id="award-email-title" className="text-base font-semibold">Review award email</h3><p className="text-xs text-neutral-500 mt-1">Nothing is sent until you approve it.</p></div><button onClick={onClose} className="text-neutral-500 hover:text-white text-xl" aria-label="Close">×</button></div><div className="grid md:grid-cols-[180px_1fr]"><div className="border-b md:border-b-0 md:border-r border-white/10 p-3 space-y-1">{pending.map(item => <button key={item._id} onClick={() => onSelect(item._id)} className={`w-full rounded-lg px-3 py-2 text-left ${item._id === draft._id ? 'bg-white/10 text-white' : 'text-neutral-500 hover:bg-white/[.04]'}`}><p className="text-xs font-medium">{item.kind === 'award' ? 'Purchase order' : 'Supplier notification'}</p><p className="truncate text-[10px] mt-0.5">{item.subject}</p></button>)}</div><div className="p-5"><div className="mb-3 rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] uppercase tracking-wider text-neutral-600">Subject</p><p className="mt-1 text-sm text-neutral-200">{draft.subject}</p></div><label className="text-xs text-neutral-500">Message<textarea value={body} onChange={e => setBody(e.target.value)} rows={14} className="mt-1 w-full resize-y rounded-xl border border-white/10 bg-neutral-900 px-3 py-3 text-sm leading-6 text-neutral-200 outline-none focus:border-white/30"/></label>{message && <div role="alert" className="mt-3 rounded-xl border border-red-500/20 bg-red-500/[.05] p-3 text-sm text-red-300">{message}</div>}<div className="mt-4 flex justify-end gap-2"><button onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-neutral-400 hover:text-white">Not now</button><button disabled={sending} onClick={() => void handleSend()} className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black disabled:opacity-50">{sending ? 'Sending…' : 'Approve & send'}</button></div></div></div></div></div>
}
