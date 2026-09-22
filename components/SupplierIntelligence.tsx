import { useAction, useQuery } from 'convex/react'
import { useMemo, useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'
import { Skeleton } from './ui'

function riskClasses(risk: 'low' | 'medium' | 'high') {
  if (risk === 'high') return 'border-red-900/50 bg-red-950/20 text-red-300'
  if (risk === 'medium') return 'border-amber-900/50 bg-amber-950/20 text-amber-300'
  return 'border-emerald-900/50 bg-emerald-950/20 text-emerald-300'
}

export function SupplierIntelligence({ project }: { project: Doc<'projects'> }) {
  const intelligence = useQuery(api.supplierIntelligence.supplierIntelligence, { projectId: project._id })
  const suppliers = useQuery(api.suppliers.listSuppliers, { projectId: project._id })
  const researchSupplier = useAction(api.suppliers.researchSupplier)
  const mapSupplierWebsite = useAction(api.suppliers.mapSupplierWebsite)
  const crawlSupplierWebsite = useAction(api.suppliers.crawlSupplierWebsite)
  const refreshSupplierWebsite = useAction(api.suppliers.refreshSupplierWebsite)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState<{ supplierId: string; action: string } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionResult, setActionResult] = useState<{ supplierId: string; action: string; text: string } | null>(null)
  const selected = useMemo(() => intelligence?.find(item => item.supplierId === selectedId), [intelligence, selectedId])

  async function runWebsiteAction(supplier: Doc<'suppliers'>, actionName: 'research' | 'map' | 'crawl' | 'refresh') {
    if (!supplier.website) return
    setActionError(null)
    setActionResult(null)
    setBusy({ supplierId: supplier._id, action: actionName })
    try {
      if (actionName === 'research') {
        const result = await researchSupplier({ supplierId: supplier._id })
        setActionResult({ supplierId: supplier._id, action: actionName, text: `Research complete${result?.title ? `: ${result.title}` : '.'}` })
      } else if (actionName === 'map') {
        const result = await mapSupplierWebsite({ supplierId: supplier._id })
        setActionResult({ supplierId: supplier._id, action: actionName, text: `Site mapped${Array.isArray(result?.links) ? ` · ${result.links.length} links found.` : '.'}` })
      } else if (actionName === 'crawl') {
        await crawlSupplierWebsite({ supplierId: supplier._id })
        setActionResult({ supplierId: supplier._id, action: actionName, text: 'Crawl started and is being processed.' })
      } else {
        await refreshSupplierWebsite({ supplierId: supplier._id })
        setActionResult({ supplierId: supplier._id, action: actionName, text: 'Supplier website refreshed.' })
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : `Could not ${actionName} supplier website.`)
    } finally {
      setBusy(null)
    }
  }

  if (intelligence === undefined) return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Skeleton className="h-44"/><Skeleton className="h-44"/><Skeleton className="h-44"/></div>
  if (intelligence.length === 0 && (!suppliers || suppliers.length === 0)) return null

  return <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[.02] p-4">
    <div><p className="text-xs uppercase tracking-[.16em] text-neutral-600">Supplier intelligence</p><p className="mt-1 text-sm text-neutral-500">Review supplier evidence and run Firecrawl website intelligence without leaving the project.</p></div>

    {suppliers && suppliers.length > 0 && <div className="rounded-xl border border-white/10 bg-black/10 p-4">
      <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium text-neutral-200">Website intelligence</p><p className="mt-1 text-xs text-neutral-600">Research, map, crawl, or refresh a supplier website.</p></div><span className="text-[10px] uppercase tracking-wide text-neutral-700">Firecrawl</span></div>
      <div className="mt-3 divide-y divide-white/[.05]">
        {suppliers.map(supplier => {
          const isBusy = busy?.supplierId === supplier._id
          const disabled = !supplier.website || isBusy
          return <div key={supplier._id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><p className="truncate text-sm text-neutral-300">{supplier.name}</p><p className="truncate text-xs text-neutral-600">{supplier.website ?? 'No website available'}</p></div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button type="button" disabled={disabled} onClick={() => void runWebsiteAction(supplier, 'research')} className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">{isBusy && busy.action === 'research' ? 'Researching…' : 'Research Supplier'}</button>
              <button type="button" disabled={disabled} onClick={() => void runWebsiteAction(supplier, 'map')} className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">{isBusy && busy.action === 'map' ? 'Mapping…' : 'Map Site'}</button>
              <button type="button" disabled={disabled} onClick={() => void runWebsiteAction(supplier, 'crawl')} className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">{isBusy && busy.action === 'crawl' ? 'Crawling…' : 'Crawl Site'}</button>
              <button type="button" disabled={disabled} onClick={() => void runWebsiteAction(supplier, 'refresh')} className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">{isBusy && busy.action === 'refresh' ? 'Refreshing…' : 'Refresh Supplier'}</button>
            </div>
          </div>
        })}
      </div>
      {actionError && <p className="mt-3 rounded-md border border-red-900/50 bg-red-950/20 px-3 py-2 text-xs text-red-300">{actionError}</p>}
      {actionResult && <p className="mt-3 rounded-md border border-emerald-900/50 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-300">{actionResult.text}</p>}
    </div>}

    {intelligence.length > 0 && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {intelligence.map(item => <button key={item.supplierId} onClick={() => setSelectedId(item.supplierId as string)} className="rounded-xl border border-white/10 bg-black/10 p-4 text-left transition hover:border-white/20">
        <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-neutral-200">{item.supplierName}</p><p className="mt-1 text-xs text-neutral-600">{item.historicalProjects} prior project{item.historicalProjects === 1 ? '' : 's'} with the same supplier identity</p></div><span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide ${riskClasses(item.risk)}`}>{item.risk} review</span></div>
        <div className="mt-4 grid grid-cols-3 gap-2"><div><p className="text-[10px] text-neutral-700">Coverage</p><p className="mt-1 text-sm text-neutral-300">{item.coveragePercent}%</p></div><div><p className="text-[10px] text-neutral-700">Confidence</p><p className="mt-1 text-sm text-neutral-300">{Math.round(item.averageConfidence * 100)}%</p></div><div><p className="text-[10px] text-neutral-700">Revisions</p><p className="mt-1 text-sm text-neutral-300">{item.revisions}</p></div></div>
        <p className="mt-3 text-xs text-neutral-600">{item.quoteCount} quote{item.quoteCount === 1 ? '' : 's'} in this project{item.averageLeadTimeDays !== undefined ? ` · ${Math.round(item.averageLeadTimeDays)}d avg lead time` : ''}</p>
      </button>)}
    </div>}

    {selected && <div className="rounded-xl border border-white/10 bg-[#0b0e0c] p-4">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[.16em] text-amber-400">Review signals</p><p className="mt-1 text-sm text-neutral-300">Evidence and useful follow-up prompts for {selected.supplierName}</p></div><button onClick={() => setSelectedId(null)} className="text-neutral-600 hover:text-white">×</button></div>
      <div className="mt-4 grid gap-4 md:grid-cols-2"><div><p className="text-xs text-neutral-600">Risk flags</p>{selected.riskFlags.length === 0 ? <p className="mt-2 text-sm text-emerald-300">No configured risk flags.</p> : <ul className="mt-2 space-y-1">{selected.riskFlags.map(flag => <li key={flag} className="text-sm text-neutral-400">• {flag}</li>)}</ul>}</div><div><p className="text-xs text-neutral-600">Negotiation signals</p>{selected.negotiationSignals.length === 0 ? <p className="mt-2 text-sm text-neutral-600">No additional signals yet.</p> : <ul className="mt-2 space-y-1">{selected.negotiationSignals.map(signal => <li key={signal} className="text-sm text-neutral-400">• {signal}</li>)}</ul>}</div></div>
    </div>}
  </section>
}
