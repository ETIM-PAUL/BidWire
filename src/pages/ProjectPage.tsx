import { useQuery } from 'convex/react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { ActivityFeed } from '../components/ActivityFeed'

const TABS = ['Materials', 'Suppliers', 'Inbox', 'Compare'] as const

export function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const projectId = id as Id<'projects'>
  const project = useQuery(api.projects.getProject, { projectId })
  const [tab, setTab] = useState<(typeof TABS)[number]>('Materials')

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
      </header>
      <div className="grid grid-cols-[1fr_280px]">
        <div>
          <nav className="flex gap-1 border-b border-neutral-800 px-6">
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
          <main className="px-6 py-8 text-sm text-neutral-400">{tab} — coming soon.</main>
        </div>
        <aside className="border-l border-neutral-800 px-4 py-6">
          <ActivityFeed projectId={projectId} />
        </aside>
      </div>
    </div>
  )
}
