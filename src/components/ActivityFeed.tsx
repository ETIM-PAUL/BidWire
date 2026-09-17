import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export function ActivityFeed({ projectId }: { projectId: Id<'projects'> }) {
  const events = useQuery(api.events.listEvents, { projectId })

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-neutral-300">Activity</h2>
      {events === undefined && <p className="text-sm text-neutral-500">Loading…</p>}
      {events?.length === 0 && <p className="text-sm text-neutral-500">No activity yet.</p>}
      <ul className="space-y-2">
        {events?.map((e) => (
          <li key={e._id} className="text-sm text-neutral-400">
            <span className="text-neutral-200">{e.type.replaceAll('_', ' ')}</span>
            <span className="block text-xs text-neutral-600">
              {new Date(e.createdAt).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
