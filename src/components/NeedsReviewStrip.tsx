import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'

export function NeedsReviewStrip({ project }: { project: Doc<'projects'> }) {
  const needsReview = useQuery(api.quotes.listNeedsReview, { projectId: project._id })
  const lineItems = useQuery(api.lineItems.listLineItems, { projectId: project._id })
  const confirmMatch = useMutation(api.quotes.confirmQuoteLineMatch)
  const [picked, setPicked] = useState<Record<string, string>>({})

  if (!needsReview || needsReview.length === 0) {
    return null
  }

  return (
    <div className="rounded-lg border border-amber-900 bg-amber-950/30 p-4 space-y-3">
      <h3 className="text-sm font-medium text-amber-400">
        Needs review ({needsReview.length})
      </h3>
      <p className="text-xs text-neutral-500">
        These quoted items couldn't be confidently matched to a line item. Confirm the right
        match below.
      </p>
      <div className="space-y-2">
        {needsReview.map((line) => (
          <div
            key={line._id}
            className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-800 bg-neutral-950 p-2 text-sm"
          >
            <span className="text-neutral-300">{line.supplierName}:</span>
            <span className="text-neutral-400 truncate">{line.rawDescription}</span>
            <span className="text-neutral-600 text-xs">
              {line.quantity} {line.unit} @ {line.unitPrice}
            </span>
            <span className="text-xs text-amber-500">
              {Math.round(line.matchConfidence * 100)}% confidence
            </span>
            <select
              value={picked[line._id] ?? ''}
              onChange={(e) => setPicked((prev) => ({ ...prev, [line._id]: e.target.value }))}
              className="ml-auto bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-xs"
            >
              <option value="">Match to…</option>
              {lineItems?.map((li) => (
                <option key={li._id} value={li._id}>
                  {li.name}
                </option>
              ))}
            </select>
            <button
              disabled={!picked[line._id]}
              onClick={() => {
                const lineItemId = picked[line._id]
                if (!lineItemId) return
                void confirmMatch({
                  quoteLineId: line._id,
                  lineItemId: lineItemId as Id<'lineItems'>,
                })
              }}
              className="text-xs rounded-md bg-neutral-100 text-neutral-900 px-2 py-1 font-medium disabled:opacity-40"
            >
              Confirm
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
