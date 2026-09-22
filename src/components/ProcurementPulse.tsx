import { useQuery } from 'convex/react'
import { useMemo, useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'
import { Skeleton, StatusPill } from './ui'

const EVENT_LABELS: Record<string, string> = {
  project_created: 'Project created',
  boq_generated: 'BOQ generated',
  boq_ready: 'BOQ ready',
  inbox_provisioned: 'Project inbox provisioned',
  supplier_selected: 'Supplier selected',
  rfq_sent: 'RFQ sent',
  message_received: 'Supplier message received',
  message_classified: 'Message classified',
  quote_received: 'Quote received',
  follow_up_sent: 'Follow-up sent',
  negotiation_sent: 'Negotiation sent',
  project_awarded: 'Project awarded',
  award_draft_created: 'Award email drafted',
  po_sent: 'Award email sent',
  project_cancelled: 'Project cancelled',
}

function relativeTime(timestamp: number) {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export function ProcurementPulse({ project }: { project: Doc<'projects'> }) {
  const suppliers = useQuery(api.suppliers.listSuppliers, { projectId: project._id })
  const matrix = useQuery(api.comparison.comparisonMatrix, { projectId: project._id })
  const events = useQuery(api.events.listEvents, { projectId: project._id })
  const [showTimeline, setShowTimeline] = useState(false)

  const stats = useMemo(() => {
    if (!suppliers || !matrix) return null
    const quoted = matrix.columns.length
    const waiting = suppliers.filter((s) => s.status === 'rfq_sent' || s.status === 'silent').length
    const averageCoverage = quoted > 0
      ? Math.round(matrix.columns.reduce((sum, column) => sum + column.coveragePercent, 0) / quoted)
      : 0
    const incomplete = matrix.columns.filter((column) => column.coveragePercent < 100).length
    return { quoted, waiting, averageCoverage, incomplete }
  }, [suppliers, matrix])

  if (!suppliers || !matrix || !events) {
    return <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Skeleton className="h-24"/><Skeleton className="h-24"/><Skeleton className="h-24"/><Skeleton className="h-24"/></div>
  }

  const attention: { title: string; detail: string; tone: 'amber' | 'red' | 'blue' }[] = []
  if (project.status !== 'awarded' && project.status !== 'cancelled') {
    if (stats?.waiting) attention.push({ title: `${stats.waiting} supplier${stats.waiting === 1 ? '' : 's'} awaiting a response`, detail: 'Follow up from the supplier workflow when appropriate.', tone: 'amber' })
    if (stats?.incomplete) attention.push({ title: `${stats.incomplete} quote${stats.incomplete === 1 ? '' : 's'} are incomplete`, detail: 'Review missing line items before making an award decision.', tone: 'red' })
    if (matrix.rows.some((row) => row.cells.some((cell) => cell.matchConfidence < 0.7))) attention.push({ title: 'Some quote lines need review', detail: 'Low-confidence matches are flagged in Compare.', tone: 'blue' })
  }

  return (
    <section className="mb-6 space-y-3" aria-label="Procurement health">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-[.16em] text-neutral-600">Suppliers</p><p className="mt-2 text-2xl font-semibold">{suppliers.length}</p><p className="mt-1 text-xs text-neutral-600">in this project</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-[.16em] text-neutral-600">Quotes</p><p className="mt-2 text-2xl font-semibold">{stats?.quoted ?? 0}</p><p className="mt-1 text-xs text-neutral-600">latest supplier versions</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-[.16em] text-neutral-600">Coverage</p><p className="mt-2 text-2xl font-semibold">{stats?.averageCoverage ?? 0}%</p><p className="mt-1 text-xs text-neutral-600">average quoted scope</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] uppercase tracking-[.16em] text-neutral-600">Status</p><div className="mt-3"><StatusPill tone={project.status === 'awarded' ? 'green' : project.status === 'cancelled' ? 'red' : attention.length ? 'amber' : 'blue'}>{project.status === 'awarded' ? 'Closed' : attention.length ? `${attention.length} need attention` : 'On track'}</StatusPill></div><p className="mt-2 text-xs text-neutral-600">decision remains with you</p></div>
      </div>

      {(attention.length > 0 || events.length > 0) && <div className="rounded-2xl border border-white/10 bg-white/[.02] p-4">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-neutral-600">Procurement pulse</p><p className="mt-1 text-sm text-neutral-400">A concise view of what changed and what may need attention.</p></div><button className="text-xs text-neutral-500 hover:text-white" onClick={() => setShowTimeline((value) => !value)}>{showTimeline ? 'Hide timeline' : 'View timeline'}</button></div>
        {attention.length > 0 && <div className="mt-4 grid gap-2 md:grid-cols-3">{attention.map((item) => <div key={item.title} className="rounded-xl border border-white/10 bg-black/20 p-3"><StatusPill tone={item.tone}>{item.tone === 'red' ? 'Review' : item.tone === 'amber' ? 'Waiting' : 'Check'}</StatusPill><p className="mt-2 text-sm font-medium text-neutral-200">{item.title}</p><p className="mt-1 text-xs leading-5 text-neutral-600">{item.detail}</p></div>)}</div>}
        {showTimeline && <div className="mt-4 space-y-2 border-t border-white/[.06] pt-4">{events.slice(0, 8).map((event) => <div key={event._id} className="flex items-center gap-3 text-xs"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"/><span className="text-neutral-300">{EVENT_LABELS[event.type] ?? event.type.replaceAll('_', ' ')}</span><span className="ml-auto text-neutral-700">{relativeTime(event.createdAt)}</span></div>)}</div>}
      </div>}
    </section>
  )
}
