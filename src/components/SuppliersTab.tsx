import { useAction, useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'

const SOURCE_BADGE: Record<Doc<'suppliers'>['source'], string> = {
  firecrawl: 'bg-blue-950 text-blue-300 border-blue-900',
  demo: 'bg-emerald-950 text-emerald-300 border-emerald-900',
  manual: 'bg-neutral-800 text-neutral-300 border-neutral-700',
}

export function SuppliersTab({ project }: { project: Doc<'projects'> }) {
  const suppliers = useQuery(api.suppliers.listSuppliers, { projectId: project._id })
  const config = useQuery(api.suppliers.getPublicConfig)
  const discoverSuppliers = useAction(api.discovery.discoverSuppliers)
  const toggleSelected = useMutation(api.suppliers.toggleSupplierSelected)
  const [discovering, setDiscovering] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDiscover() {
    setError(null)
    setDiscovering(true)
    try {
      await discoverSuppliers({ projectId: project._id })
    } catch {
      setError('Could not run supplier discovery. Try again.')
    } finally {
      setDiscovering(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-neutral-300">
            Suppliers {suppliers ? `(${suppliers.length})` : ''}
          </h3>
          {config?.demoMode && (
            <p className="text-xs text-amber-500 mt-0.5">
              Demo mode: only demo suppliers can be selected for an RFQ.
            </p>
          )}
        </div>
        <button
          onClick={() => void handleDiscover()}
          disabled={discovering}
          className="rounded-md bg-neutral-100 text-neutral-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {discovering ? 'Discovering…' : 'Discover suppliers'}
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}

      {suppliers === undefined ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : suppliers.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 p-6 text-center">
          <p className="text-sm text-neutral-400">
            No suppliers yet. Generate a materials list first, then discover suppliers by
            category.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {suppliers.map((s) => {
            const locked = config?.demoMode === true && s.source !== 'demo'
            return (
              <div key={s._id} className="rounded-lg border border-neutral-800 p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-sm">{s.name}</span>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${SOURCE_BADGE[s.source]}`}
                  >
                    {s.source}
                  </span>
                </div>
                {s.website && (
                  <a
                    href={s.website}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-xs text-neutral-500 hover:text-neutral-300 truncate"
                  >
                    {s.website}
                  </a>
                )}
                {s.email && <p className="text-xs text-neutral-500">{s.email}</p>}
                <div className="flex flex-wrap gap-1">
                  {s.categories.slice(0, 5).map((c) => (
                    <span
                      key={c}
                      className="rounded bg-neutral-900 border border-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400"
                    >
                      {c}
                    </span>
                  ))}
                </div>
                {s.listPrices && s.listPrices.length > 0 && (
                  <div className="text-xs text-neutral-500 space-y-0.5 pt-1 border-t border-neutral-900">
                    <p className="text-neutral-600">Published prices</p>
                    {s.listPrices.slice(0, 3).map((lp, i) => (
                      <p key={i} className="truncate">
                        {lp.itemHint}: {lp.price}/{lp.unit}
                      </p>
                    ))}
                  </div>
                )}
                <label
                  className={`flex items-center gap-2 pt-2 text-xs ${
                    locked ? 'text-neutral-600' : 'text-neutral-300 cursor-pointer'
                  }`}
                  title={locked ? "Demo mode: real suppliers can't be selected for sending" : undefined}
                >
                  <input
                    type="checkbox"
                    checked={s.status === 'selected'}
                    disabled={locked}
                    onChange={() => void toggleSelected({ supplierId: s._id })}
                    className="disabled:cursor-not-allowed"
                  />
                  Select for RFQ
                </label>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
