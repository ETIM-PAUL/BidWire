# Bidwire

An AI procurement agent for small contractors. It turns a job description into a
materials list, finds suppliers, emails RFQs from a per-project inbox, reads the
replies, and builds a price comparison that updates live as quotes arrive.

## Stack

| Layer | Choice |
|---|---|
| Backend | Convex (database, queries, mutations, actions, HTTP actions, scheduler, file storage) |
| Components | Firecrawl (`@firecrawl/firecrawl-convex`), AgentMail (`@agentmail/convex`), Workflow, Rate Limiter, Action Retrier |
| LLM | OpenAI, behind a single structured-output wrapper (`convex/lib/llm.ts`) |
| Frontend | React + Vite + TypeScript + Tailwind CSS, on Convex static hosting |
| Auth | Convex Auth |

## Build log

- **Phase 0 — Project setup.** Scaffolded Convex + React/Vite/TS/Tailwind. Installed
  the Firecrawl, AgentMail, Workflow, Rate Limiter, and Action Retrier components.
  Added `convex/lib/llm.ts`: a single `structuredCall()` helper that wraps every
  OpenAI call behind a strict JSON-schema structured output, plus a `smokeTest`
  action to verify the pipeline end to end.
- **Phase 1 — Data model.** `convex/schema.ts`: full schema (projects, lineItems,
  suppliers, threads, messages, quotes, quoteLines, drafts, events, plus the
  Convex Auth `users`/auth tables), every field validated, `by_project` on every
  child table, plus the FK and lookup indexes later phases need (idempotency on
  `messages.by_provider_message_id`, thread matching on
  `threads.by_provider_thread_id`, latest-quote lookups on `quotes.by_supplier`).
  Schema deploys clean; reviewed against the Convex reviewer checklist and fixed
  two findings: missing indexes on foreign-key fields, and `llm.ts`'s `smokeTest`
  demoted from a public `action` to an `internalAction` (a public action calling
  a paid OpenAI endpoint with no auth check is a cost-abuse vector).
- **Phase 2 — Auth & project shell.** Convex Auth (Password provider); the build
  plan's target was v2-alpha, but its React/Vite wiring is documented as
  unfinished (`WIP`), so per the plan's own fallback clause we used the stable
  v1 (`@convex-dev/auth` 0.0.95) instead. `convex/lib/auth.ts` centralizes
  ownership checks (`requireUserId`, `requireProjectOwner`) used by every
  project-scoped function. `convex/projects.ts` (`createProject`,
  `listMyProjects`, `getProject`) and `convex/events.ts` (`listEvents`) enforce
  it. Frontend: `/` (project list + create form) and `/p/:id` (workspace with
  Materials/Suppliers/Inbox/Compare tabs + live activity feed), gated by
  `Authenticated`/`Unauthenticated`/`AuthLoading`.
  Verified, not just typechecked: `convex/projects.test.ts` (convex-test) proves
  a non-owner is refused a project and its events, and an unauthenticated
  caller is refused everything — the negative cases, not just the happy path.
  A full browser run (sign up → create project → live list update with no
  reload → open workspace → tabs/activity render) passed with zero console
  errors. Reviewed against the Convex reviewer checklist; fixed one finding
  (`listMyProjects` used an unbounded `.collect()` — capped with `.take(500)`).
- **Phase 3 — Job intake → bill of quantities.** `convex/boq.ts`'s `generateBoq`
  action turns a project's job description into 15–30 structured line items via
  `structuredCall` (strict JSON schema, no free-text parsing), writing them in
  batches of 4 (`convex/lineItems.ts`'s `insertBatch` internal mutation) so rows
  visibly stream in rather than appearing all at once. `convex/lineItems.ts`
  adds the full editable-table surface (`createLineItem`, `updateLineItem`,
  `deleteLineItem`, `moveLineItem`), all ownership-checked via a new
  `requireLineItemOwner` helper. Optional photo/drawing upload at intake via
  `convex/files.ts` (`generateUploadUrl` + Convex file storage), attached to
  the project at creation.
  Reviewed against the Convex reviewer checklist and fixed a real finding: the
  first version of `files.ts`'s attachment-URL query took a client-supplied
  list of storage IDs and resolved any of them for any signed-in user — an
  IDOR letting one user resolve another project's files if they ever obtained
  a storage ID. Fixed by deriving the storage IDs server-side from the
  caller's own (ownership-checked) project record instead of trusting client
  input; added `convex/lineItems.test.ts` as a regression test proving a
  second user is refused both the line items and the attachments of a project
  they don't own.
- **Phase 4 — Supplier discovery (Firecrawl).** Registered the Firecrawl, Rate
  Limiter, and Action Retrier components (`convex/convex.config.ts`) — the
  first phase to actually use any Convex component. `convex/discovery.ts`'s
  `discoverSuppliers` is a thin public dispatcher: for each distinct
  materials category on the project, it fires a retried, rate-limited
  background job (`discoverForCategory`) via the Action Retrier and returns
  immediately, so the Suppliers tab fills in reactively as each category
  finishes rather than blocking on the whole run. Each job does one
  rate-limited Firecrawl `search()` call with `scrapeOptions` (search +
  scrape in a single Firecrawl-side call), then runs each result's scraped
  markdown through `structuredCall` to extract `{businessName, email, phone,
  categories, listPrices}` — the scraped page is untrusted input, passed only
  as extraction data into a fixed schema, never anything that can trigger a
  write outside that schema. Pages with no email or phone are discarded.
  Results are deduped by domain (`convex/suppliers.ts`'s
  `insertDiscoveredSupplier`) and written with `source: "firecrawl"`. Demo
  supplier personas (`ensureDemoSuppliers`, `source: "demo"`, emails pulled
  from `DEMO_ALLOWLIST`) are always added, idempotently.
  `toggleSupplierSelected` enforces the demo-mode guardrail server-side, not
  just in the UI: while `DEMO_MODE=true`, only `source: "demo"` suppliers can
  be set to `status: "selected"` — a real scraped supplier can't be selected
  for an RFQ no matter what the client sends. Reviewed against the Convex
  reviewer checklist (clean this round); `convex/suppliers.test.ts` proves
  the DEMO_MODE lock can't be bypassed by selecting a real supplier directly,
  proves it still works outside DEMO_MODE, and proves the usual ownership
  isolation.
- **Phase 5 — Project inbox & RFQ sending (AgentMail).** Registered the
  AgentMail component and mounted its webhook at `/agentmail/webhook`
  (`convex/http.ts`). `convex/inbox.ts`'s `provisionInbox` creates a project's
  AgentMail inbox idempotently; `convex/rfq.ts`'s `draftRfqs` action
  provisions the inbox if needed, then drafts one RFQ email per
  `status: "selected"` supplier via `structuredCall`, containing only the
  line items matching that supplier's categories, with a computed reply-by
  date. Drafts land as `pending` rows the contractor edits and approves
  individually or all at once (`src/components/RfqDrafts.tsx`) before
  `convex/drafts.ts`'s `sendRfq` actually sends via
  `agentmail.sendMessage`.
  `sendRfq` enforces the `DEMO_MODE` allowlist server-side: a send to a
  recipient not on `DEMO_ALLOWLIST` never reaches AgentMail. Fixed a real bug
  caught by the regression test itself: the first version tried to both log
  the blocked attempt to the `events` table *and* throw in the same
  mutation — but Convex mutations are fully transactional, so the throw
  silently rolled back the very log entry meant to record it. Fixed by
  having the blocked path return a structured `{ok: false, blockedReason}`
  instead of throwing, so the log write actually commits while the caller
  still sees a clear, loud failure. `convex/drafts.test.ts` proves the block
  fires, is logged, and leaves the draft/supplier state untouched.
  Also hit a real type-checker error in `convex/http.ts`: `@agentmail/convex`'s
  `RunMutationCtx` type is pinned against an older Convex version, so wiring
  the webhook exactly as their README shows fails `tsc` on the current
  `convex` version — confirmed it's a types-only version-skew (the actual
  call shape is unaffected) and bridged it with a narrow, commented cast
  rather than suppressing the check.
  Also found and worked around a real upstream bug: `@agentmail/convex`
  0.1.0's `createInbox` (and its other inbox-management calls) are
  internal-visibility functions that fail to resolve cross-component on this
  Convex version - runtime error `Couldn't resolve agentmail.lib.createInbox`,
  reproduced directly against the deployed component with a throwaway probe
  action rather than guessed at. Ruled out a real but separate issue along
  the way (an unrelated, still-unused `@convex-dev/workflow` install from
  Phase 0 was pulling in a conflicting nested `@convex-dev/workpool` version -
  fixed by removing it, since Workflow isn't needed until Phase 9). Bisecting
  by function visibility and type (public query, public mutation, internal
  mutation, internal action) isolated the actual pattern: every *public*
  function on the component resolves and works (confirmed `enqueueSend`, what
  `sendMessage` - and so `sendRfq` - depends on), every *internal* one
  doesn't. Since the package exposes no public inbox-creation call,
  `convex/inbox.ts`'s `provisionInbox` now calls AgentMail's REST API
  directly for just that one operation (same endpoint, auth header, and
  payload shape the component's own internal `createInbox` uses), while
  sending still goes through the real component end to end.

## Security note

Supplier emails are untrusted input. Inbound message content is only ever passed
to the LLM as data to extract into a fixed JSON schema (`convex/lib/llm.ts`'s
`structuredCall`). Model output never triggers a send, never changes a price
another supplier gave, and never mutates project state outside that extraction
schema — see Phase 7 of `bidwire-build-plan.md` for the extraction pipeline this
protects.
