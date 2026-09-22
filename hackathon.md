# BidWire

AI procurement agent for small contractors: turn a job description into materials, find suppliers, send RFQs, read replies, compare quotes, negotiate, and award the work.

## Stack

- React + Vite + TypeScript + Tailwind
- Convex + Convex Auth
- OpenAI for structured extraction/drafting
- Firecrawl for supplier discovery
- AgentMail for real RFQ/reply email flows

## What is working

- Auth, projects, sample bathroom demo job and live workspace tabs.
- BOQ generation and editable materials with file attachments.
- Firecrawl supplier discovery with category-based extraction and demo suppliers.
- Per-project AgentMail inboxes, outbound RFQs, inbound replies and threaded inbox.
- Quote extraction from prose and PDF replies with confidence/review handling.
- Live comparison matrix, coverage, missing quotes and split/single award calculations.
- Follow-ups and negotiation drafts with human approval.
- Award readiness validation, purchase-order/decline drafts and award audit events.
- Mobile-responsive UI, skeleton/loading states, toasts and activity feed.
- Demo-mode supplier allowlist and AgentMail simulator flow.

## Reliability and security

- Ownership checks across project-scoped Convex functions.
- Idempotent inbound message handling and AgentMail webhook verification.
- Structured LLM outputs and validation of quote matches against project-owned line items.
- Supplier-email/sender isolation and RFQ scope tracking.
- Awarding uses the sent RFQ scope, records validation failures, and discards remaining pending RFQ drafts.
- Negotiation is blocked after a project is awarded.
- Convex reviewer findings and typecheck issues fixed as they were found.

## Demo flow

Create/sample job → BOQ → discover/select suppliers → draft/send RFQs → supplier replies → quote extraction → Compare → negotiate → award → review/send purchase-order emails.

Award emails are generated as drafts; they are not sent automatically until the contractor approves them.
