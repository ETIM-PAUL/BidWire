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

  return <div className="min-h-screen bg-[#070908] text-neutral-100">
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#070908]/90 backdrop-blur-xl"><div className="mx-auto max-w-[1440px] px-4 sm:px-6"><div className="flex min-h-16 items-center gap-3"><Link to="/" className="text-sm text-neutral-500 transition hover:text-neutral-200">← Projects</Link><span className="text-neutral-800">/</span><h1 className="min-w-0 truncate text-base font-semibold tracking-tight">{project.name}</h1><StatusPill tone={project.status === 'awarded' ? 'green' : project.status === 'cancelled' ? 'red' : 'amber'}>{project.status}</StatusPill><div className="ml-auto">{project.status !== 'cancelled' && project.status !== 'awarded' && <button onClick={() => setConfirmCancel(true)} className="text-xs text-neutral-600 transition hover:text-red-400">Cancel project</button>}</div></div></div></header>
    <div className="border-b border-white/10 bg-[#0a0d0b]/90"><div className="mx-auto max-w-[1440px] px-2 sm:px-6"><nav className="flex gap-1 overflow-x-auto" aria-label="Project sections">{TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={`relative whitespace-nowrap px-3 py-3 text-sm font-medium transition ${tab === t ? 'text-white' : 'text-neutral-600 hover:text-neutral-300'}`}>{t}{tab === t && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-amber-400" />}</button>)}</nav></div></div>
    <div className="mx-auto max-w-[1440px] px-4 pt-6 sm:px-6 sm:pt-8"><ProcurementPulse project={project} /></div>
    <div className="mx-auto grid max-w-[1440px] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
      <main className="min-w-0 px-4 py-2 sm:px-6 sm:py-4">{tab === 'Materials' && <MaterialsTab project={project} />}{tab === 'Suppliers' && <SuppliersTab project={project} />}{tab === 'Inbox' && <InboxTab project={project} />}{tab === 'Compare' && <CompareTab project={project} />}</main>
      <aside className="border-t border-white/10 px-4 py-5 lg:border-l lg:border-t-0 lg:px-5 lg:py-6"><ActivityFeed projectId={projectId} /></aside>
    </div>
    <ConfirmDialog open={confirmCancel} title="Cancel this project?" description="This stops pending follow-up nudges. Existing supplier messages and quotes will remain available for review." confirmLabel="Cancel project" destructive onCancel={() => setConfirmCancel(false)} onConfirm={() => void handleCancel()} />
  </div>
}
