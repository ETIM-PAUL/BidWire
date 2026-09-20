import { useQuery } from 'convex/react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'

type AwardMode = 'single' | 'split'

// Tracks which (lineItem, supplier) cells changed price since the last
// render and returns their keys so the caller can flash them briefly -
// this is what makes the matrix visibly "come alive" as replies land,
// without a refresh.
function useFlashingCells(cellKeyToPrice: Map<string, number>): Set<string> {
  const previous = useRef<Map<string, number>>(new Map())
  const [flashing, setFlashing] = useState<Set<string>>(new Set())

  useEffect(() => {
    const changed = new Set<string>()
    for (const [key, price] of cellKeyToPrice) {
      const prevPrice = previous.current.get(key)
      if (prevPrice !== undefined && prevPrice !== price) {
        changed.add(key)
      }
    }
    previous.current = new Map(cellKeyToPrice)
    if (changed.size > 0) {
      setFlashing(changed)
      const timeout = setTimeout(() => setFlashing(new Set()), 1500)
      return () => clearTimeout(timeout)
    }
  }, [cellKeyToPrice])

  return flashing
}

export function CompareTab({ project }: { project: Doc<'projects'> }) {
  const matrix = useQuery(api.comparison.comparisonMatrix, { projectId: project._id })
  const [awardMode, setAwardMode] = useState<AwardMode>('single')

  const cellKeyToPrice = new Map<string, number>()
  for (const row of matrix?.rows ?? []) {
    for (const cell of row.cells) {
      cellKeyToPrice.set(`${row.lineItemId}:${cell.supplierId}`, cell.unitPrice)
    }
  }
  const flashingCells = useFlashingCells(cellKeyToPrice)

  if (matrix === undefined) {
    return <p className="text-sm text-neutral-500">Loading…</p>
  }
  if (matrix.columns.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-800 p-6 text-center">
        <p className="text-sm text-neutral-400">
          No quotes yet. Once suppliers reply, their prices will show up here live.
        </p>
      </div>
    )
  }

  const sortedColumns = [...matrix.columns].sort((a, b) => a.basketTotal - b.basketTotal)
  const cheapestBasket = sortedColumns[0]
  const splitSupplierIds =
    awardMode === 'split'
      ? new Set(matrix.rows.map((r) => r.bestSupplierId).filter((id): id is Id<'suppliers'> => !!id))
      : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {matrix.bestFullCoverageSupplierId && matrix.bestFullCoverageBasketTotal !== undefined && (
          <div className="rounded-lg border border-emerald-900 bg-emerald-950/30 px-4 py-3 text-sm">
            <p className="text-emerald-400 font-medium">Best single-supplier basket</p>
            <p className="text-neutral-300">
              {matrix.columns.find((c) => c.supplierId === matrix.bestFullCoverageSupplierId)
                ?.supplierName}{' '}
              — {matrix.bestFullCoverageBasketTotal.toLocaleString()} {project.currency}
            </p>
          </div>
        )}
        {matrix.bestSplitBasketTotal !== undefined && (
          <div className="rounded-lg border border-blue-900 bg-blue-950/30 px-4 py-3 text-sm">
            <p className="text-blue-400 font-medium">Best split order</p>
            <p className="text-neutral-300">
              {matrix.bestSplitBasketTotal.toLocaleString()} {project.currency}
              {matrix.splitSavings !== undefined && matrix.splitSavings > 0 && (
                <> · save {matrix.splitSavings.toLocaleString()} {project.currency} by splitting</>
              )}
            </p>
          </div>
        )}
        {matrix.rows.map((row) => {
          if (row.bestPrice === undefined || row.worstPrice === undefined || row.worstPrice === row.bestPrice) {
            return null
          }
          const pct = Math.round(((row.worstPrice - row.bestPrice) / row.worstPrice) * 100)
          if (pct < 10) return null
          const bestSupplier = matrix.columns.find((c) => c.supplierId === row.bestSupplierId)
          return (
            <div
              key={row.lineItemId}
              className="rounded-lg border border-neutral-800 px-4 py-3 text-sm"
            >
              <p className="text-neutral-300 font-medium">
                {bestSupplier?.supplierName} is {pct}% cheaper on {row.name}
              </p>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-neutral-500">Award as:</span>
        <button
          onClick={() => setAwardMode('single')}
          className={`px-2 py-1 rounded-md ${awardMode === 'single' ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-400 border border-neutral-800'}`}
        >
          Single supplier
        </button>
        <button
          onClick={() => setAwardMode('split')}
          className={`px-2 py-1 rounded-md ${awardMode === 'split' ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-400 border border-neutral-800'}`}
        >
          Cheapest split
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-left text-neutral-500">
              <th className="px-3 py-2 font-normal sticky left-0 bg-neutral-950">Item</th>
              <th className="px-3 py-2 font-normal">Published</th>
              {sortedColumns.map((col) => (
                <th key={col.supplierId} className="px-3 py-2 font-normal min-w-[140px]">
                  <div className="flex items-center gap-1">
                    <span
                      className={
                        awardMode === 'single' && col.supplierId === cheapestBasket?.supplierId
                          ? 'text-neutral-100'
                          : 'text-neutral-400'
                      }
                    >
                      {col.supplierName}
                    </span>
                    {col.missingLineItemIds.length > 0 && (
                      <span
                        title={`Missing ${col.missingLineItemIds.length} item(s)`}
                        className="text-[10px] text-amber-500"
                      >
                        ({col.coveragePercent}%)
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-600 font-normal">
                    basket {col.basketTotal.toLocaleString()}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.lineItemId} className="border-b border-neutral-900 last:border-0">
                <td className="px-3 py-2 sticky left-0 bg-neutral-950">
                  <p className="text-neutral-200">{row.name}</p>
                  <p className="text-xs text-neutral-600">
                    {row.quantity} {row.unit}
                  </p>
                </td>
                <td className="px-3 py-2 text-neutral-500 text-xs">
                  {row.publishedPrice !== undefined ? row.publishedPrice.toLocaleString() : '—'}
                </td>
                {sortedColumns.map((col) => {
                  const cell = row.cells.find((c) => c.supplierId === col.supplierId)
                  const key = `${row.lineItemId}:${col.supplierId}`
                  const isFlashing = flashingCells.has(key)
                  const isBest = cell && row.bestSupplierId === col.supplierId
                  const isSplitPick =
                    splitSupplierIds !== null &&
                    cell &&
                    row.bestSupplierId === col.supplierId &&
                    splitSupplierIds.has(col.supplierId)
                  return (
                    <td
                      key={col.supplierId}
                      className={`px-3 py-2 transition-colors duration-1000 ${
                        isFlashing ? 'bg-amber-500/30' : ''
                      } ${
                        (awardMode === 'single' && isBest) || (awardMode === 'split' && isSplitPick)
                          ? 'bg-emerald-950/40 text-emerald-300 font-medium'
                          : 'text-neutral-400'
                      }`}
                    >
                      {cell ? (
                        <>
                          {cell.unitPrice.toLocaleString()}
                          {cell.matchConfidence < 0.7 && (
                            <span className="text-amber-500 ml-1" title="Needs review">
                              ⚠
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-neutral-700">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
