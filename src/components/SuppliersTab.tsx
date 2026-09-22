import { useAction, useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { FollowUpDrafts } from './FollowUpDrafts'
import { NegotiationDrafts, NegotiateButton } from './NegotiationDrafts'
import { RfqDrafts } from './RfqDrafts'
import { SupplierIntelligence } from './SupplierIntelligence'
import { Skeleton, StatusPill } from './ui'

const SOURCE_BADGE: Record<Doc<'suppliers'>['source'], string> = { firecrawl: 'bg-blue-950 text-blue-300 border-blue-900', demo: 'bg-emerald-950 text-emerald-300 border-emerald-900', manual: 'bg-neutral-800 text-neutral-300 border-neutral-700' }

export function SuppliersTab({ project }: { project: Doc<'projects'> }) {
  const suppliers = useQuery(api.suppliers.listSuppliers, { projectId: project._id })
  const matrix = useQuery(api.comparison.comparisonMatrix, { projectId: project._id })
  const config = useQuery(api.suppliers.getPublicConfig)
  const discoverSuppliers = useAction(api.discovery.discoverSuppliers)
  const toggleSelected = useMutation(api.suppliers.toggleSupplierSelected)
  const setAutoApprove = useMutation(api.followups.setAutoApproveFollowUps)
  const [discovering, setDiscovering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openNegotiationDraftId, setOpenNegotiationDraftId] = useState<Id<'drafts'> | null>(null)

  async function handleDiscover() { setError(null); setDiscovering(true); try { await discoverSuppliers({ projectId: project._id }) } catch (error) { setError(error instanceof Error ? error.message : 'Could not run supplier discovery. Try again.') } finally { setDiscovering(false) } }
  const coverageBySupplier = new Map((matrix?.columns ?? []).map((column) => [column.supplierId, column]))

  return <div className="space-y-4">
    <div className="flex items-center justify-between"><div><h3 className="text-sm font-medium text-neutral-300">Suppliers {suppliers ? `(${suppliers.length})` : ''}</h3>{config?.demoMode && <p className="text-xs text-amber-500 mt-0.5">Demo mode: only demo suppliers can be selected for an RFQ.</p>}</div><button onClick={() => void handleDiscover()} disabled={discovering} className="rounded-md bg-neutral-100 text-neutral-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50">{discovering ? 'Discovering…' : 'Discover suppliers'}</button></div>
    {error && <p className="text-sm text-red-400">{error}</p>}
    <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer w-fit"><input type="checkbox" checked={project.autoApproveFollowUps ?? false} onChange={(e) => void setAutoApprove({ projectId: project._id, enabled: e.currentTarget.checked })} />Auto-approve follow-up nudges to non-responding suppliers</label>
    {suppliers === undefined ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"><Skeleton className="h-48"/><Skeleton className="h-48"/><Skeleton className="h-48"/></div> : suppliers.length === 0 ? <div className="rounded-lg border border-neutral-800 p-6 text-center"><p className="text-sm text-neutral-400">No suppliers yet. Generate a materials list first, then discover suppliers by category.</p></div> : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{suppliers.map((s) => {
      const locked = config?.demoMode === true && s.source !== 'demo'; const negotiationDisabled = project.status === 'awarded'; const intelligence = coverageBySupplier.get(s._id)
      return <div key={s._id} className="rounded-lg border border-neutral-800 p-4 space-y-2"><div className="flex items-start justify-between gap-2"><span className="font-medium text-sm">{s.name}</span><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${SOURCE_BADGE[s.source]}`}>{s.source}</span></div>{s.website && <a href={s.website} target="_blank" rel="noreferrer" className="block text-xs text-neutral-500 hover:text-neutral-300 truncate">{s.website}</a>}{s.email && <p className="text-xs text-neutral-500">{s.email}</p>}<div className="flex flex-wrap gap-1">{s.categories.slice(0, 5).map((c) => <span key={c} className="rounded bg-neutral-900 border border-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">{c}</span>)}</div>{intelligence && <div className="mt-3 grid grid-cols-3 gap-2 border-t border-neutral-900 pt-3"><div><p className="text-[10px] uppercase tracking-wide text-neutral-700">Coverage</p><p className="mt-1 text-xs font-medium text-neutral-300">{intelligence.coveragePercent}%</p></div><div><p className="text-[10px] uppercase tracking-wide text-neutral-700">Version</p><p className="mt-1 text-xs font-medium text-neutral-300">v{intelligence.quoteVersion}</p></div><div><p className="text-[10px] uppercase tracking-wide text-neutral-700">Missing</p><p className="mt-1 text-xs font-medium text-neutral-300">{intelligence.missingLineItemIds.length}</p></div></div>}{intelligence && intelligence.coveragePercent < 100 && <p className="rounded-md border border-amber-900/50 bg-amber-950/20 px-2 py-1.5 text-[11px] leading-4 text-amber-400">Quote does not cover the full current scope. Review missing items before award.</p>}{s.listPrices && s.listPrices.length > 0 && <div className="text-xs text-neutral-500 space-y-0.5 pt-1 border-t border-neutral-900"><p className="text-neutral-600">Published prices</p>{s.listPrices.slice(0, 3).map((lp, i) => <p key={i} className="truncate">{lp.itemHint}: {lp.price}/{lp.unit}</p>)}</div>}{s.status === 'replied' && <div className="flex items-center gap-2"><NegotiateButton projectId={project._id} supplierId={s._id} disabled={negotiationDisabled} onDraftReady={setOpenNegotiationDraftId}/>{negotiationDisabled && <span className="text-[10px] text-neutral-600">Awarded</span>}</div>}<label className={`flex items-center gap-2 pt-2 text-xs ${locked ? 'text-neutral-600' : 'text-neutral-300 cursor-pointer'}`} title={locked ? "Demo mode: real suppliers can't be selected for sending" : undefined}><input type="checkbox" checked={s.status === 'selected'} disabled={locked || project.status === 'awarded'} onChange={() => void toggleSelected({ supplierId: s._id })} className="disabled:cursor-not-allowed" />Select for RFQ</label></div>
    })}</div>}
    <SupplierIntelligence project={project} />
    <RfqDrafts project={project} /><FollowUpDrafts project={project} /><NegotiationDrafts project={project} openDraftId={openNegotiationDraftId} onClose={() => setOpenNegotiationDraftId(null)} />
  </div>
}
