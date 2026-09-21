import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

const icons: Record<string,string> = {
  project_created:'＋', boq_ready:'▦', inbox_provisioned:'✉', rfq_sent:'↗', message_received:'↓',
  message_unmatched:'?', message_classified:'✓', quote_received:'₦', project_awarded:'★',
  award_draft_created:'✎', po_sent:'✓', decline_sent:'—', award_send_blocked:'!'
}

export function ActivityFeed({ projectId }: { projectId: Id<'projects'> }) {
  const events = useQuery(api.events.listEvents, { projectId })
  return <div className="space-y-3">
    <h2 className="text-sm font-semibold text-neutral-200">Activity</h2>
    {events===undefined && <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-10 rounded bg-neutral-900 animate-pulse" />)}</div>}
    {events?.length===0 && <div className="rounded-lg border border-neutral-800 p-3 text-sm text-neutral-500">No activity yet. Actions will appear here as the job moves.</div>}
    <ul className="space-y-2">{events?.map(e=><li key={e._id} className="flex gap-2 text-sm text-neutral-400">
      <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neutral-800 text-xs text-neutral-200">{icons[e.type]??'•'}</span>
      <span className="min-w-0"><span className="text-neutral-200">{e.type.replaceAll('_',' ')}</span><span className="block text-xs text-neutral-600">{new Date(e.createdAt).toLocaleString()}</span></span>
    </li>)}</ul>
  </div>
}
