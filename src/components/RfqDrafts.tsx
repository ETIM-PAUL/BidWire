import { useAction, useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'

export function RfqDrafts({ project }: { project: Doc<'projects'> }) {
  const suppliers = useQuery(api.suppliers.listSuppliers, { projectId: project._id })
  const drafts = useQuery(api.drafts.listDrafts, { projectId: project._id })
  const draftRfqs = useAction(api.rfq.draftRfqs)
  const sendRfq = useMutation(api.drafts.sendRfq)
  const updateDraft = useMutation(api.drafts.updateDraft)
  const discardDraft = useMutation(api.drafts.discardDraft)
  const [drafting, setDrafting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sendErrors, setSendErrors] = useState<Record<string, string>>({})

  const selectedCount = suppliers?.filter((s) => s.status === 'selected').length ?? 0
  const pendingDrafts = drafts?.filter((d) => d.kind === 'rfq' && d.status === 'pending') ?? []
  const supplierName = (supplierId: Id<'suppliers'>) =>
    suppliers?.find((s) => s._id === supplierId)?.name ?? 'Supplier'

  async function handleDraft() {
    setError(null)
    setDrafting(true)
    try {
      await draftRfqs({ projectId: project._id })
    } catch {
      setError('Could not draft RFQs. Try again.')
    } finally {
      setDrafting(false)
    }
  }

  async function handleSend(draftId: Id<'drafts'>) {
    setSendErrors((prev) => ({ ...prev, [draftId]: '' }))
    try {
      const result = await sendRfq({ draftId })
      if (!result.ok) {
        setSendErrors((prev) => ({
          ...prev,
          [draftId]: result.blockedReason ?? 'Send was blocked.',
        }))
      }
    } catch (err) {
      setSendErrors((prev) => ({
        ...prev,
        [draftId]: err instanceof Error ? err.message : 'Could not send.',
      }))
    }
  }

  async function handleSendAll() {
    for (const draft of pendingDrafts) {
      await handleSend(draft._id)
    }
  }

  if (selectedCount === 0 && pendingDrafts.length === 0) {
    return null
  }

  return (
    <div className="space-y-3 border-t border-neutral-900 pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-300">
          RFQ drafts {drafts ? `(${pendingDrafts.length} pending)` : ''}
        </h3>
        <div className="flex gap-2">
          {selectedCount > 0 && (
            <button
              onClick={() => void handleDraft()}
              disabled={drafting}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 disabled:opacity-50"
            >
              {drafting ? 'Drafting…' : `Draft RFQs for ${selectedCount} selected`}
            </button>
          )}
          {pendingDrafts.length > 0 && (
            <button
              onClick={() => void handleSendAll()}
              className="rounded-md bg-neutral-100 text-neutral-900 px-3 py-1.5 text-sm font-medium"
            >
              Approve all &amp; send
            </button>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="space-y-3">
        {pendingDrafts.map((draft) => (
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
            {sendErrors[draft._id] && (
              <p className="text-xs text-red-400">{sendErrors[draft._id]}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
