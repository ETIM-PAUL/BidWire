import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { ActivityFeed } from '../components/ActivityFeed'
import { CompareTab } from '../components/CompareTab'
import { InboxTab } from '../components/InboxTab'
import { MaterialsTab } from '../components/MaterialsTab'
import { ProcurementPulse } from '../components/ProcurementPulse'
import { SuppliersTab } from '../components/SuppliersTab'
import { ConfirmDialog, PageSkeleton, StatusPill, useToast } from '../components/ui'

const TABS = ['Materials', 'Suppliers', 'Inbox', 'Compare'] as const

export function ProjectPage() {
  const { id } = useParams<{ id: string }>(); const projectId = id as Id<'projects'>
  const project = useQuery(api.projects.getProject, { projectId }); const cancelProject = useMutation(api.followups.cancelProject); const { toast } = useToast()
  const [tab, setTab] = useState<(typeof TABS)[number]>('Materials'); const [confirmCancel, setConfirmCancel] = useState(false)
  if (project === undefined) return <PageSkeleton />

  async function handleCancel() {
    setConfirmCancel(false)
    try { await cancelProject({ projectId }); toast('success', 'Project cancelled', 'Pending follow-up nudges have been stopped.') }
    catch (error) { toast('error', 'Could not cancel project', error instanceof Error ? error.message : 'Please try again.') }
  }

  const awarded = project.status === 'awarded'
  const statusTone = awarded ? 'green' : project.status === 'cancelled' ? 'red' : 'amber'

  return <div className="bidwire-app-bg min-h-screen text-neutral-100">
    <header className="sticky top-3 z-30 px-3 sm:px-5"><div className="bidwire-shell bidwire-topbar rounded-2xl px-4 sm:px-5"><div className="flex min-h-[68px] items-center gap-3"><Link to="/" className="flex shrink-0 items-center gap-2 text-xs font-semibold text-neutral-500 transition hover:text-white">← <span className="hidden sm:inline">Workspace</span></Link><span className="text-neutral-800">/</span><div className="min-w-0"><h1 className="truncate text-sm font-semibold tracking-tight text-white sm:text-base">{project.name}</h1><p className="hidden truncate text-[11px] text-neutral-600 sm:block">{project.location}</p></div><StatusPill tone={statusTone}>{project.status}</StatusPill><div className="ml-auto">{project.status !== 'cancelled' && !awarded && <button onClick={() => setConfirmCancel(true)} className="bidwire-button bidwire-button-ghost text-xs">Cancel project</button>}</div></div></div></header>

    <main className="bidwire-shell pb-14 pt-6 sm:pt-8">
      <section className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end"><div><div className="bidwire-eyebrow">Project workspace</div><h2 className="mt-2 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">{project.name}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">{project.jobDescription}</p></div><div className="flex flex-wrap gap-2"><span className="rounded-xl border border-white/[.07] bg-white/[.025] px-3 py-2 text-xs text-neutral-400">{project.location}</span><span className="rounded-xl border border-white/[.07] bg-white/[.025] px-3 py-2 text-xs text-neutral-400">{project.currency}</span>{awarded && <span className="rounded-xl border border-emerald-300/20 bg-emerald-300/[.07] px-3 py-2 text-xs font-semibold text-[var(--bw-accent)]">Award complete</span>}</div></section>

      <div className="mt-6"><ProcurementPulse project={project} /></div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-white/[.08] bg-[#0b1015]/80 shadow-[0_24px_80px_rgba(0,0,0,.16)]"><div className="border-b border-white/[.07] px-2 sm:px-4"><nav className="flex gap-1 overflow-x-auto" aria-label="Project sections">{TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={`relative whitespace-nowrap rounded-lg px-3 py-4 text-sm font-semibold transition ${tab === t ? 'text-white' : 'text-neutral-600 hover:bg-white/[.025] hover:text-neutral-300'}`}>{t}{tab === t && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[var(--bw-accent)]" />}</button>)}</nav></div>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]"><main className="min-w-0 p-4 sm:p-6">{tab === 'Materials' && <MaterialsTab project={project} />}{tab === 'Suppliers' && <SuppliersTab project={project} />}{tab === 'Inbox' && <InboxTab project={project} />}{tab === 'Compare' && <CompareTab project={project} />}</main><aside className="border-t border-white/[.07] bg-black/10 p-4 sm:p-6 lg:border-l lg:border-t-0"><ActivityFeed projectId={projectId} /></aside></div>
      </div>
    </main>
    <ConfirmDialog open={confirmCancel} title="Cancel this project?" description="This stops pending follow-up nudges. Existing supplier messages and quotes will remain available for review." confirmLabel="Cancel project" destructive onCancel={() => setConfirmCancel(false)} onConfirm={() => void handleCancel()} />
  </div>
}
