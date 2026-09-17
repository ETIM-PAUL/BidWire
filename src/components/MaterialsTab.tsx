import { useAction, useMutation, useQuery } from 'convex/react'
import { useEffect, useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'

export function MaterialsTab({ project }: { project: Doc<'projects'> }) {
  const lineItems = useQuery(api.lineItems.listLineItems, { projectId: project._id })
  const attachments = useQuery(api.files.getProjectAttachments, { projectId: project._id })
  const generateBoq = useAction(api.boq.generateBoq)
  const createLineItem = useMutation(api.lineItems.createLineItem)
  const updateLineItem = useMutation(api.lineItems.updateLineItem)
  const deleteLineItem = useMutation(api.lineItems.deleteLineItem)
  const moveLineItem = useMutation(api.lineItems.moveLineItem)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setError(null)
    setGenerating(true)
    try {
      await generateBoq({ projectId: project._id })
    } catch {
      setError('Could not generate a materials list. Try again.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-neutral-800 p-4">
        <h3 className="text-sm font-medium text-neutral-300 mb-1">Job description</h3>
        <p className="text-sm text-neutral-400 whitespace-pre-wrap">{project.jobDescription}</p>
        {attachments && attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {attachments.map((a) =>
              a.url ? (
                <a
                  key={a.storageId}
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-neutral-400 underline hover:text-neutral-200"
                >
                  attachment
                </a>
              ) : null,
            )}
          </div>
        )}
      </div>

      {lineItems === undefined ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : lineItems.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 p-6 text-center space-y-3">
          <p className="text-sm text-neutral-400">
            No materials list yet. Generate one from the job description.
          </p>
          <button
            onClick={() => void handleGenerate()}
            disabled={generating}
            className="rounded-md bg-neutral-100 text-neutral-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {generating ? 'Generating…' : 'Generate materials list'}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-neutral-300">
              Materials ({lineItems.length})
            </h3>
            <button
              onClick={() => void createLineItem({ projectId: project._id })}
              className="text-sm text-neutral-400 hover:text-neutral-200"
            >
              + Add item
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-neutral-500">
                  <th className="px-3 py-2 font-normal w-8"></th>
                  <th className="px-3 py-2 font-normal">Name</th>
                  <th className="px-3 py-2 font-normal">Spec</th>
                  <th className="px-3 py-2 font-normal w-24">Qty</th>
                  <th className="px-3 py-2 font-normal w-24">Unit</th>
                  <th className="px-3 py-2 font-normal">Category</th>
                  <th className="px-3 py-2 font-normal w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, i) => (
                  <tr key={item._id} className="border-b border-neutral-900 last:border-0">
                    <td className="px-3 py-1.5">
                      <div className="flex flex-col">
                        <button
                          disabled={i === 0}
                          onClick={() =>
                            void moveLineItem({ lineItemId: item._id, direction: 'up' })
                          }
                          className="text-neutral-600 hover:text-neutral-300 disabled:opacity-20 leading-none"
                        >
                          ▲
                        </button>
                        <button
                          disabled={i === lineItems.length - 1}
                          onClick={() =>
                            void moveLineItem({ lineItemId: item._id, direction: 'down' })
                          }
                          className="text-neutral-600 hover:text-neutral-300 disabled:opacity-20 leading-none"
                        >
                          ▼
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <EditableCell
                        value={item.name}
                        onCommit={(v) => void updateLineItem({ lineItemId: item._id, name: v })}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <EditableCell
                        value={item.spec}
                        onCommit={(v) => void updateLineItem({ lineItemId: item._id, spec: v })}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <EditableCell
                        value={String(item.quantity)}
                        type="number"
                        onCommit={(v) =>
                          void updateLineItem({ lineItemId: item._id, quantity: Number(v) || 0 })
                        }
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <EditableCell
                        value={item.unit}
                        onCommit={(v) => void updateLineItem({ lineItemId: item._id, unit: v })}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <EditableCell
                        value={item.category}
                        onCommit={(v) =>
                          void updateLineItem({ lineItemId: item._id, category: v })
                        }
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <button
                        onClick={() => void deleteLineItem({ lineItemId: item._id })}
                        className="text-neutral-600 hover:text-red-400"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function EditableCell({
  value,
  onCommit,
  type = 'text',
}: {
  value: string
  onCommit: (value: string) => void
  type?: 'text' | 'number'
}) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  return (
    <input
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) {
          onCommit(draft)
        }
      }}
      className="w-full bg-transparent text-neutral-200 focus:outline-none focus:ring-1 focus:ring-neutral-600 rounded px-1 py-0.5"
    />
  )
}
