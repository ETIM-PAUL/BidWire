# BidWire — AI Procurement Operating Layer

> **From project scope to supplier award, with the evidence and approvals connected.**

BidWire is a hackathon-built procurement workspace for contractors and procurement teams. It turns a natural-language project brief into a structured materials/BOQ workflow, discovers relevant suppliers, drafts and sends RFQs, receives supplier replies through AgentMail, extracts quotes from email/PDF content, compares coverage and price, prepares negotiation messages, validates awards, and prepares final supplier communications for human approval.

## What makes the current build different

BidWire is not only an RFQ generator or a comparison table. The project keeps the procurement context connected across the full lifecycle:

**Project → BOQ → Suppliers → RFQ → Inbox → Quote extraction → Compare → Negotiate → Award → Supplier communication → Workspace intelligence**

The system is deliberately human-in-the-loop. AI prepares structured information and drafts; application validation protects the workflow; the contractor controls supplier selection, negotiation and final outbound commitments.

## Current feature set

### 1. Project-to-BOQ workflow
- Natural-language project creation.
- Structured line items with quantity, unit, specification and category.
- Editable materials become the source of truth for later procurement steps.
- Optional project attachments.
- Sample project flow for repeatable demos.

### 2. Relevant supplier discovery
- Firecrawl-backed supplier discovery.
- Material/category-aware supplier targeting.
- Demo suppliers for reproducible testing.
- Manual supplier support.
- Supplier email identity is kept separate from the project's own procurement inbox.

### 3. RFQ automation
- Supplier-specific RFQ drafts.
- RFQs are scoped to the items actually selected for the supplier.
- Editable drafts before sending.
- AgentMail delivery.
- Demo-mode allowlisting for safe local testing.
- RFQ/thread/message activity is recorded in Convex.

### 4. Real supplier inbox loop
- Each project can have an AgentMail inbox.
- Outbound RFQs create tracked supplier threads.
- AgentMail webhooks bring inbound replies back into BidWire.
- Replies remain attached to the project and supplier context.
- Incoming email is treated as untrusted data before AI classification/extraction.

### 5. AI quote extraction
Supplier replies can contain plain text, tables or PDF quotations. BidWire extracts:
- line descriptions
- unit prices
- quantities
- units
- currency
- lead time
- delivery cost
- quote validity
- notes

Matching is validated against line items belonging to the current project. Low-confidence/unmatched lines are surfaced for review rather than silently becoming trusted scope.

Known unit conversions are deterministic code, not LLM arithmetic.

### 6. Compare workspace
Compare exposes:
- supplier coverage
- missing items
- quoted prices
- basket totals
- single-supplier coverage
- split-award possibilities
- revised quote lines
- low-confidence matches
- decision brief / print view

The comparison keeps price and scope coverage visible together.

### 7. Follow-ups
- Scheduled follow-up checks for non-responding suppliers.
- Controlled follow-up drafting.
- Optional auto-approval setting.
- Maximum follow-up limit.
- Cancellation stops pending follow-up schedules.

### 8. Negotiation
- Negotiation can be launched from supplier/quote context.
- AI creates an editable negotiation draft.
- Draft is reviewed in a modal.
- Negotiation is disabled once the project is awarded.

### 9. Award validation
- Single-supplier and split-award modes.
- Award scope is based on sent RFQ scope.
- Backend validation prevents awarding an item without a valid quote.
- Delivery address/date are required.
- Award and validation events are recorded.
- Pending RFQ drafts are discarded after award.

### 10. Award communication
After an award, BidWire prepares supplier communications such as purchase-order and notification drafts. The user reviews them in a modal, can edit the message, and explicitly chooses **Approve & send**. Award communication is not silently sent by the AI.

### 11. Supplier intelligence
The Suppliers tab now exposes evidence-backed review signals from the current project and prior projects in the workspace where supplier identity can be matched.

Signals include:
- quote coverage
- extraction/match confidence
- quote revisions
- observed lead time
- quote validity
- delivery cost
- missing scope
- negotiation prompts

These are review signals, not an automatic supplier ranking.

## Then phase — procurement memory and workspace intelligence

The latest build adds an **Insights** workspace at `/insights`.

It aggregates data BidWire has actually collected instead of inventing external market information:

- project and award counts
- active vs awarded projects
- supplier response counts
- awarded spend grouped by currency
- largest awarded projects
- repeated observed prices for the same project item/unit/currency
- observed price range and average
- latest vs previous observed price direction
- repeated supplier lead-time observations
- pending follow-up drafts
- silent suppliers
- quotes expiring within seven days
- projects awaiting comparison
- scheduled follow-up threads

Historical price and lead-time sections intentionally require multiple observations. BidWire labels these as observed signals rather than forecasts.

## Safety and trust boundaries

BidWire's architecture separates:

**AI preparation**
- BOQ generation
- supplier discovery assistance
- quote extraction
- RFQ drafting
- follow-up drafting
- negotiation drafting
- award drafting

**Deterministic application logic**
- project ownership
- RFQ scope
- quote matching boundaries
- known unit conversions
- award readiness
- supplier allowlisting
- follow-up limits
- outbound send permissions

**Human approval**
- supplier selection
- negotiation send
- final award communication

Supplier emails are treated as untrusted input. AI extraction is constrained by structured schemas and project-owned IDs; inbound content cannot directly choose another project's records.

## Stack

- React + TypeScript + Vite
- Tailwind CSS
- Convex + Convex Auth
- AgentMail
- OpenAI
- Firecrawl
- PDF.js for server-side PDF text extraction

## Local development

```bash
npm install
npx convex dev
npm run dev
```

Keep API keys in local/Convex environment configuration and out of git.

## Demo path

1. Create a project or launch the sample job.
2. Generate/review materials.
3. Discover and select suppliers.
4. Draft and approve RFQs.
5. Send RFQs through AgentMail.
6. Reply from supplier inboxes.
7. Watch replies enter BidWire and become quotes.
8. Review Compare and Needs Review.
9. Negotiate where needed.
10. Validate and award.
11. Review award emails and explicitly send them.
12. Open **Insights** to show the procurement memory layer.

## Product principle

> **BidWire lets AI do the repetitive procurement preparation without letting AI silently make the commercial commitment.**

That principle is reflected in the data model, backend validation, email controls, review states and UI workflow.
