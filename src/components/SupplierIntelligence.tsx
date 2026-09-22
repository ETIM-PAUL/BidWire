import { useQuery } from 'convex/react'
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = useMemo(() => intelligence?.find(item => item.supplierId === selectedId), [intelligence, selectedId])
  if (intelligence === undefined) return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Skeleton className="h-44"/><Skeleton className="h-44"/><Skeleton className="h-44"/></div>
  if (intelligence.length === 0) return null
  return <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[.02] p-4">
    <div><p className="text-xs uppercase tracking-[.16em] text-neutral-600">Supplier intelligence</p><p className="mt-1 text-sm text-neutral-500">Evidence from this project and prior projects in your workspace. Review signals are not automatic supplier recommendations.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {intelligence.map(item => <button key={item.supplierId} onClick={() => setSelectedId(item.supplierId as string)} className="rounded-xl border border-white/10 bg-black/10 p-4 text-left transition hover:border-white/20">
        <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-neutral-200">{item.supplierName}</p><p className="mt-1 text-xs text-neutral-600">{item.historicalProjects} prior project{item.historicalProjects === 1 ? '' : 's'} with the same supplier identity</p></div><span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide ${riskClasses(item.risk)}`}>{item.risk} review</span></div>
        <div className="mt-4 grid grid-cols-3 gap-2"><div><p className="text-[10px] text-neutral-700">Coverage</p><p className="mt-1 text-sm text-neutral-300">{item.coveragePercent}%</p></div><div><p className="text-[10px] text-neutral-700">Confidence</p><p className="mt-1 text-sm text-neutral-300">{Math.round(item.averageConfidence * 100)}%</p></div><div><p className="text-[10px] text-neutral-700">Revisions</p><p className="mt-1 text-sm text-neutral-300">{item.revisions}</p></div></div>
        <p className="mt-3 text-xs text-neutral-600">{item.quoteCount} quote{item.quoteCount === 1 ? '' : 's'} in this project{item.averageLeadTimeDays !== undefined ? ` · ${Math.round(item.averageLeadTimeDays)}d avg lead time` : ''}</p>
      </button>)}
    </div>
    {selected && <div className="rounded-xl border border-white/10 bg-[#0b0e0c] p-4">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[.16em] text-amber-400">Review signals</p><p className="mt-1 text-sm text-neutral-300">Evidence and useful follow-up prompts for {selected.supplierName}</p></div><button onClick={() => setSelectedId(null)} className="text-neutral-600 hover:text-white">×</button></div>
      <div className="mt-4 grid gap-4 md:grid-cols-2"><div><p className="text-xs text-neutral-600">Risk flags</p>{selected.riskFlags.length === 0 ? <p className="mt-2 text-sm text-emerald-300">No configured risk flags.</p> : <ul className="mt-2 space-y-1">{selected.riskFlags.map(flag => <li key={flag} className="text-sm text-neutral-400">• {flag}</li>)}</ul>}</div><div><p className="text-xs text-neutral-600">Negotiation signals</p>{selected.negotiationSignals.length === 0 ? <p className="mt-2 text-sm text-neutral-600">No additional signals yet.</p> : <ul className="mt-2 space-y-1">{selected.negotiationSignals.map(signal => <li key={signal} className="text-sm text-neutral-400">• {signal}</li>)}</ul>}</div></div>
    </div>}
  </section>
}
