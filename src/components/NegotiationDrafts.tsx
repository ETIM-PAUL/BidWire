import { useAction, useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'

export function NegotiationDrafts({ project }: { project: Doc<'projects'> }) {
  const suppliers = useQuery(api.suppliers.listSuppliers, { projectId: project._id })
  const drafts = useQuery(api.drafts.listDrafts, { projectId: project._id })
  const negotiate = useAction(api.negotiateDraft.negotiateWithSupplier)
  const sendNegotiation = useMutation(api.negotiate.sendNegotiationDraft)
  const updateDraft = useMutation(api.drafts.updateDraft)
  const discardDraft = useMutation(api.drafts.discardDraft)
  const [busy, setBusy] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const pending = drafts?.filter((d) => d.kind === 'counter' && d.status === 'pending') ?? []
  const supplierName = (id: Id<'suppliers'>) =>
    suppliers?.find((s) => s._id === id)?.name ?? 'Supplier'

  async function handleGenerate(supplierId: Id<'suppliers'>, lineItemId?: Id<'lineItems'>) {
    const key = lineItemId ? `${supplierId}:${lineItemId}` : supplierId
    setBusy(key)
    setErrors((prev) => ({ ...prev, [key]: '' }))
    try {
      const result = await negotiate({
        projectId: project._id,
        supplierId,
        lineItemIds: lineItemId ? [lineItemId] : undefined,
      })
      if (!result.ok) setErrors((prev) => ({ ...prev, [key]: result.reason }))
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : 'Could not generate negotiation draft.',
      }))
    } finally {
      setBusy(null)
    }
  }

  async function handleSend(draftId: Id<'drafts'>) {
    setErrors((prev) => ({ ...prev, [draftId]: '' }))
    try {
      const result = await sendNegotiation({ draftId })
      if (!result.ok) {
        setErrors((prev) => ({
          ...prev,
          [draftId]: result.blockedReason ?? 'Send was blocked.',
        }))
      }
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [draftId]: err instanceof Error ? err.message : 'Could not send negotiation.',
      }))
    }
  }

  if (pending.length === 0) return null

  return (
    <div className="space-y-3 border-t border-neutral-900 pt-4">
      <div>
        <h3 className="text-sm font-medium text-neutral-300">Negotiation drafts ({pending.length})</h3>
        <p className="text-xs text-neutral-500 mt-1">
          Review and edit the counter-offer before approving it. Any price in the final message must
          exist in a stored quote.
        </p>
      </div>
      {pending.map((draft) => (
        <div key={draft._id} className="rounded-lg border border-neutral-800 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{supplierName(draft.supplierId)}</span>
            <div className="flex gap-2">
              <button
                onClick={() => void handleSend(draft._id)}
                className="text-xs rounded-md bg-neutral-100 text-neutral-900 px-2 py-1 font-medium"
              >
                Approve &amp; send
              </button>
              <button
                onClick={() => void discardDraft({ draftId: draft._id })}
                className="text-xs text-neutral-500 hover:text-red-400"
              >
                Discard
              </button>
            </div>
          </div>
          <input
            defaultValue={draft.subject}
            onBlur={(e) => {
              if (e.currentTarget.value !== draft.subject) {
                void updateDraft({ draftId: draft._id, subject: e.currentTarget.value })
              }
            }}
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-sm"
          />
          <textarea
            defaultValue={draft.body}
            rows={6}
            onBlur={(e) => {
              if (e.currentTarget.value !== draft.body) {
                void updateDraft({ draftId: draft._id, body: e.currentTarget.value })
              }
            }}
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-sm"
          />
          {errors[draft._id] && <p className="text-xs text-red-400">{errors[draft._id]}</p>}
        </div>
      ))}
    </div>
  )
}

export function NegotiateButton({
  projectId,
  supplierId,
  lineItemId,
}: {
  projectId: Id<'projects'>
  supplierId: Id<'suppliers'>
  lineItemId?: Id<'lineItems'>
}) {
  const negotiate = useAction(api.negotiateDraft.negotiateWithSupplier)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setBusy(true)
    setError(null)
    try {
      const result = await negotiate({
        projectId,
        supplierId,
        lineItemIds: lineItemId ? [lineItemId] : undefined,
      })
      if (!result.ok) setError(result.reason)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate negotiation draft.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        onClick={() => void handleClick()}
        disabled={busy}
        className="text-[11px] rounded border border-neutral-700 px-2 py-1 text-neutral-300 hover:text-neutral-100 disabled:opacity-50"
      >
        {busy ? 'Drafting…' : 'Negotiate'}
      </button>
      {error && <span className="max-w-[180px] text-[10px] text-red-400 text-right">{error}</span>}
    </span>
  )
}
