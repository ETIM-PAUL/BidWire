import { useAction, useMutation, useQuery } from 'convex/react'
import { useEffect, useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { useToast } from './ui'

export function NegotiationDrafts({ project, openDraftId, onClose }: { project: Doc<'projects'>; openDraftId: Id<'drafts'> | null; onClose: () => void }) {
  const suppliers = useQuery(api.suppliers.listSuppliers, { projectId: project._id })
  const drafts = useQuery(api.drafts.listDrafts, { projectId: project._id })
  const sendNegotiation = useMutation(api.negotiate.sendNegotiationDraft)
  const updateDraft = useMutation(api.drafts.updateDraft)
  const discardDraft = useMutation(api.drafts.discardDraft)
  const { toast } = useToast()

  const draft = drafts?.find((d) => d._id === openDraftId && d.kind === 'counter' && d.status === 'pending')
  const supplierName = (id: Id<'suppliers'>) => suppliers?.find((s) => s._id === id)?.name ?? 'Supplier'

  // Do not close the modal while the action's newly-created draft is still
  // propagating through the reactive drafts query. The previous implementation
  // closed it immediately because `drafts` could still contain the old result.
  useEffect(() => {
    if (!openDraftId || !drafts) return
    const knownDraft = drafts.find((d) => d._id === openDraftId)
    if (knownDraft && (knownDraft.kind !== 'counter' || knownDraft.status !== 'pending')) onClose()
  }, [openDraftId, draft, drafts, onClose])

  async function handleSend() {
    if (!draft) return
    try {
      const result = await sendNegotiation({ draftId: draft._id })
      if (!result.ok) toast('error', 'Negotiation blocked', result.blockedReason ?? 'The draft could not be approved.')
      else {
        toast('success', 'Negotiation sent', 'The supplier will receive the approved counter-offer in the existing thread.')
        onClose()
      }
    } catch (err) {
      toast('error', 'Could not send negotiation', err instanceof Error ? err.message : 'Please try again.')
    }
  }

  if (!openDraftId || !draft) {
    if (openDraftId) {
      return <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md" role="presentation" onMouseDown={onClose}><div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d110f] p-6 text-center shadow-2xl" role="dialog" aria-modal="true" onMouseDown={e => e.stopPropagation()}><div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-emerald-400" /><p className="mt-4 text-sm font-medium text-white">Preparing negotiation draft…</p><p className="mt-1 text-xs text-neutral-500">BidWire is generating the counter-offer.</p><button onClick={onClose} className="mt-4 text-xs text-neutral-500 hover:text-white">Cancel</button></div></div>
    }
    return null
  }

  return <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md" role="presentation" onMouseDown={onClose}><div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0d110f] p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="negotiation-title" onMouseDown={e => e.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[.16em] text-emerald-400">Human approval</p><h2 id="negotiation-title" className="mt-1 text-lg font-semibold text-white">Negotiate with {supplierName(draft.supplierId)}</h2><p className="mt-1 text-sm text-neutral-500">Review the AI draft before it is sent.</p></div><button onClick={onClose} className="text-2xl leading-none text-neutral-500 hover:text-white" aria-label="Close">×</button></div><label className="mt-5 block text-xs font-medium text-neutral-500">Subject<input value={draft.subject} onChange={e => void updateDraft({ draftId: draft._id, subject: e.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50" /></label><label className="mt-4 block text-xs font-medium text-neutral-500">Message<textarea value={draft.body} onChange={e => void updateDraft({ draftId: draft._id, body: e.target.value })} rows={10} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm leading-6 text-neutral-200 outline-none focus:border-emerald-500/50" /></label><div className="mt-4 rounded-xl border border-white/10 bg-white/[.025] px-3 py-2 text-xs text-neutral-500">Prices are checked against stored supplier quotes when the draft is approved.</div><div className="mt-5 flex justify-end gap-2"><button className="bidwire-button bidwire-button-secondary" onClick={() => void discardDraft({ draftId: draft._id }).then(onClose)}>Discard</button><button className="bidwire-button bidwire-button-primary" onClick={() => void handleSend()}>Approve &amp; send</button></div></div></div>
}

export function NegotiateButton({ projectId, supplierId, lineItemId, onDraftReady, disabled }: { projectId: Id<'projects'>; supplierId: Id<'suppliers'>; lineItemId?: Id<'lineItems'>; onDraftReady: (draftId: Id<'drafts'>) => void; disabled?: boolean }) {
  const negotiate = useAction(api.negotiateDraft.negotiateWithSupplier)
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    if (disabled || busy) return
    setBusy(true)
    try {
      const result = await negotiate({ projectId, supplierId, lineItemIds: lineItemId ? [lineItemId] : undefined })
      if (!result.ok) toast('info', 'Not negotiable', result.reason)
      else onDraftReady(result.draftId)
    } catch (err) {
      toast('error', 'Could not create draft', err instanceof Error ? err.message : 'Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return <button onClick={() => void handleClick()} disabled={disabled || busy} className="rounded-lg border border-white/10 bg-white/[.025] px-2.5 py-1.5 text-[11px] font-semibold text-neutral-300 transition hover:border-white/20 hover:bg-white/[.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Drafting…' : 'Negotiate'}</button>
}
