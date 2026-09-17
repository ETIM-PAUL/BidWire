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

## Security note

Supplier emails are untrusted input. Inbound message content is only ever passed
to the LLM as data to extract into a fixed JSON schema (`convex/lib/llm.ts`'s
`structuredCall`). Model output never triggers a send, never changes a price
another supplier gave, and never mutates project state outside that extraction
schema — see Phase 7 of `bidwire-build-plan.md` for the extraction pipeline this
protects.
