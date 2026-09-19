import { useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'

type Selection = { kind: 'thread'; id: Id<'threads'> } | { kind: 'unmatched' } | null

export function InboxTab({ project }: { project: Doc<'projects'> }) {
  const threads = useQuery(api.threads.listThreads, { projectId: project._id })
  const unmatched = useQuery(api.threads.listUnmatchedMessages, { projectId: project._id })
  const [selection, setSelection] = useState<Selection>(null)

  const messages = useQuery(
    api.threads.listMessagesForThread,
    selection?.kind === 'thread' ? { threadId: selection.id } : 'skip',
  )

  return (
    <div className="grid grid-cols-[280px_1fr] gap-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-neutral-300 mb-2">Threads</h3>
        {threads === undefined && <p className="text-sm text-neutral-500">Loading…</p>}
        {threads?.length === 0 && (
          <p className="text-sm text-neutral-500">No supplier replies yet.</p>
        )}
        {threads?.map((t) => (
          <button
            key={t._id}
            onClick={() => setSelection({ kind: 'thread', id: t._id })}
            className={`w-full text-left rounded-md px-3 py-2 text-sm ${
              selection?.kind === 'thread' && selection.id === t._id
                ? 'bg-neutral-800 text-neutral-100'
                : 'text-neutral-300 hover:bg-neutral-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium truncate">{t.supplierName}</span>
              <span className="text-[10px] text-neutral-500">{t.messageCount}</span>
            </div>
            <p className="text-xs text-neutral-500 truncate">{t.lastMessagePreview || '—'}</p>
          </button>
        ))}

        {unmatched !== undefined && unmatched.length > 0 && (
          <>
            <h3 className="text-sm font-medium text-neutral-300 mt-4 mb-2">
              Unmatched ({unmatched.length})
            </h3>
            <button
              onClick={() => setSelection({ kind: 'unmatched' })}
              className={`w-full text-left rounded-md px-3 py-2 text-sm ${
                selection?.kind === 'unmatched'
                  ? 'bg-neutral-800 text-neutral-100'
                  : 'text-neutral-300 hover:bg-neutral-900'
              }`}
            >
              Senders we couldn't match to a supplier
            </button>
          </>
        )}
      </div>

      <div className="rounded-lg border border-neutral-800 p-4 min-h-[200px]">
        {selection === null && (
          <p className="text-sm text-neutral-500">Select a thread to view messages.</p>
        )}
        {selection?.kind === 'thread' && (
          <div className="space-y-3">
            {messages === undefined && <p className="text-sm text-neutral-500">Loading…</p>}
            {messages?.map((m) => (
              <div key={m._id} className="rounded-md border border-neutral-900 p-3">
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span
                    className={
                      m.direction === 'out' ? 'text-blue-400' : 'text-emerald-400'
                    }
                  >
                    {m.direction === 'out' ? 'Sent' : 'Received'}
                  </span>
                  <span>{new Date(m.receivedAt).toLocaleString()}</span>
                </div>
                <p className="text-sm font-medium mt-1">{m.subject}</p>
                <p className="text-sm text-neutral-400 whitespace-pre-wrap mt-1">{m.bodyText}</p>
                {m.attachmentIds.length > 0 && (
                  <p className="text-xs text-neutral-500 mt-2">
                    {m.attachmentIds.length} attachment{m.attachmentIds.length > 1 ? 's' : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        {selection?.kind === 'unmatched' && (
          <div className="space-y-3">
            {unmatched?.map((m) => (
              <div key={m._id} className="rounded-md border border-neutral-900 p-3">
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span>{new Date(m.receivedAt).toLocaleString()}</span>
                </div>
                <p className="text-sm font-medium mt-1">{m.subject}</p>
                <p className="text-sm text-neutral-400 whitespace-pre-wrap mt-1">{m.bodyText}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
