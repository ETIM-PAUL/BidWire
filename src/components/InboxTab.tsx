import { useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { NeedsReviewStrip } from './NeedsReviewStrip'

type Selection = { kind: 'thread'; id: Id<'threads'> } | { kind: 'unmatched' } | null

function MessageQuote({ messageId }: { messageId: Id<'messages'> }) {
  const result = useQuery(api.quotes.getQuoteForMessage, { messageId })
  if (!result) return null
  return (
    <div className="mt-2 rounded border border-emerald-900 bg-emerald-950/30 p-2 text-xs">
      <p className="text-emerald-400 font-medium mb-1">
        Extracted quote (v{result.quote.version})
        {result.quote.deliveryCost !== undefined && ` · delivery ${result.quote.deliveryCost}`}
        {result.quote.leadTimeDays !== undefined && ` · ${result.quote.leadTimeDays}d lead time`}
      </p>
      <ul className="space-y-0.5 text-neutral-400">
        {result.lines.map((l) => (
          <li key={l._id} className="flex justify-between gap-2">
            <span className="truncate">{l.rawDescription}</span>
            <span className="shrink-0">
              {l.quantity} {l.unit} @ {l.unitPrice} = {l.total}
              {l.lineItemId === undefined && (
                <span className="text-amber-500 ml-1">(needs review)</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function InboxTab({ project }: { project: Doc<'projects'> }) {
  const threads = useQuery(api.threads.listThreads, { projectId: project._id })
  const unmatched = useQuery(api.threads.listUnmatchedMessages, { projectId: project._id })
  const [selection, setSelection] = useState<Selection>(null)

  const messages = useQuery(
    api.threads.listMessagesForThread,
    selection?.kind === 'thread' ? { threadId: selection.id } : 'skip',
  )

  return (
    <div className="space-y-4">
      <NeedsReviewStrip project={project} />
      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4">
      <div className="space-y-1 min-w-0">
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

      <div className="rounded-lg border border-neutral-800 p-3 sm:p-4 min-h-[200px] min-w-0">
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
                <p className="text-sm text-neutral-400 whitespace-pre-wrap mt-1 break-words">{m.bodyText}</p>
                {m.attachmentIds.length > 0 && (
                  <p className="text-xs text-neutral-500 mt-2">
                    {m.attachmentIds.length} attachment{m.attachmentIds.length > 1 ? 's' : ''}
                  </p>
                )}
                {m.direction === 'in' && <MessageQuote messageId={m._id} />}
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
    </div>
  )
}
