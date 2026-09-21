import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { ActivityFeed } from '../components/ActivityFeed'
import { CompareTab } from '../components/CompareTab'
import { InboxTab } from '../components/InboxTab'
import { MaterialsTab } from '../components/MaterialsTab'
import { SuppliersTab } from '../components/SuppliersTab'

const TABS = ['Materials', 'Suppliers', 'Inbox', 'Compare'] as const

export function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const projectId = id as Id<'projects'>
  const project = useQuery(api.projects.getProject, { projectId })
  const cancelProject = useMutation(api.followups.cancelProject)
  const [tab, setTab] = useState<(typeof TABS)[number]>('Materials')

  async function handleCancel() {
    if (!window.confirm('Cancel this project? This stops any pending follow-up nudges.')) {
      return
    }
    await cancelProject({ projectId })
  }

  if (project === undefined) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center">
        Loading…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 px-6 py-4 flex items-center gap-4">
        <Link to="/" className="text-neutral-400 hover:text-neutral-200 text-sm">
          ← Projects
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">{project.name}</h1>
        <span className="ml-auto text-xs uppercase tracking-wide text-neutral-500">
          {project.status}
        </span>
        {project.status !== 'cancelled' && project.status !== 'awarded' && (
          <button
            onClick={() => void handleCancel()}
            className="text-xs text-neutral-500 hover:text-red-400"
          >
            Cancel project
          </button>
        )}
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <nav className="flex gap-1 border-b border-neutral-800 px-3 sm:px-6 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-sm border-b-2 -mb-px ${
                  tab === t
                    ? 'border-neutral-100 text-neutral-100'
                    : 'border-transparent text-neutral-500 hover:text-neutral-300'
                }`}
              >
                {t}
              </button>
            ))}
          </nav>
          <main className="px-3 sm:px-6 py-6 sm:py-8">
            {tab === 'Materials' && <MaterialsTab project={project} />}
            {tab === 'Suppliers' && <SuppliersTab project={project} />}
            {tab === 'Inbox' && <InboxTab project={project} />}
            {tab === 'Compare' && <CompareTab project={project} />}
          </main>
        </div>
        <aside className="border-t lg:border-t-0 lg:border-l border-neutral-800 px-3 sm:px-4 py-5 lg:py-6">
          <ActivityFeed projectId={projectId} />
        </aside>
      </div>
    </div>
  )
}
