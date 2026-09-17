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

## Security note

Supplier emails are untrusted input. Inbound message content is only ever passed
to the LLM as data to extract into a fixed JSON schema (`convex/lib/llm.ts`'s
`structuredCall`). Model output never triggers a send, never changes a price
another supplier gave, and never mutates project state outside that extraction
schema — see Phase 7 of `bidwire-build-plan.md` for the extraction pipeline this
protects.
