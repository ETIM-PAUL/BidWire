# BidWire — AI Procurement Operating Layer

> **From project scope to supplier award, with the evidence and approvals connected.**

BidWire is a hackathon-built procurement workspace for contractors and procurement teams. It turns a natural-language project brief into a structured materials/BOQ workflow, discovers relevant suppliers, researches supplier evidence, drafts and sends RFQs, receives supplier replies through AgentMail, extracts quotes from email/PDF content, compares coverage and price, prepares negotiation messages, validates awards, and prepares final supplier communications for human approval.

## What makes the current build different

BidWire is not only an RFQ generator or a comparison table. The project keeps the procurement context connected across the full lifecycle:

**Project → BOQ → Suppliers → Supplier Intelligence → RFQ → Inbox → Quote extraction → Compare → Negotiate → Award → Supplier communication → Workspace intelligence**

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
- Location-aware supplier research and verification.
- Demo suppliers for reproducible testing.
- Manual supplier support.
- Supplier email identity is kept separate from the project's own procurement inbox.

### 3. Supplier web intelligence
- Research a supplier against the actual project location and requested BOQ categories.
- Evidence-backed location/category verification.
- Public source links and match reasons.
- Structured observations of publicly listed prices when available.
- Supplier research status and evidence stored in Convex.
- Website mapping and crawling.
- Refresh/research actions for supplier websites.

Web information is advisory evidence. A website-listed price is never silently treated as a supplier quotation.

### 4. RFQ automation
- Supplier-specific RFQ drafts.
- RFQs are scoped to the items actually selected for the supplier.
- Editable drafts before sending.
- AgentMail delivery.
- Demo-mode allowlisting for safe local testing.
- RFQ/thread/message activity is recorded in Convex.

### 5. Real supplier inbox loop
- Each project can have an AgentMail inbox.
- Outbound RFQs create tracked supplier threads.
- AgentMail webhooks bring inbound replies back into BidWire.
- Replies remain attached to the project and supplier context.
- Incoming email is treated as untrusted data before AI classification/extraction.

### 6. AI quote extraction
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

### 7. Compare workspace
Compare exposes:
- supplier coverage
- missing items
- quoted prices
- published supplier prices
- basket totals
- single-supplier coverage
- split-award possibilities
- revised quote lines
- low-confidence matches
- decision brief / download view

The comparison keeps price and scope coverage visible together. Published web prices are observations and do not replace actual supplier quotes.

### 8. Follow-ups
- Scheduled follow-up checks for non-responding suppliers.
- Controlled follow-up drafting.
- Optional auto-approval setting.
- Maximum follow-up limit.
- Cancellation stops pending follow-up schedules.

### 9. Negotiation
- Negotiation can be launched from supplier/quote context.
- AI creates an editable negotiation draft.
- Draft is reviewed in a modal.
- Negotiation is disabled once the project is awarded.

### 10. Award validation
- Single-supplier and split-award modes.
- Award scope is based on sent RFQ scope.
- Backend validation prevents awarding an item without a valid quote.
- Delivery address/date are required.
- Award and validation events are recorded.
- Pending RFQ drafts are discarded after award.
- Supplier discovery and material removal are disabled after award.

### 11. Award communication
After an award, BidWire prepares supplier communications such as purchase-order and notification drafts. The user reviews them in a modal, can edit the message, and explicitly chooses **Approve & send**. Award communication is not silently sent by the AI.

### 12. Procurement memory and workspace intelligence
The Insights workspace aggregates data BidWire has actually collected instead of inventing external market information:
- project and award counts
- supplier response counts
- awarded spend grouped by currency
- repeated observed prices for the same project item/unit/currency
- observed price range and average
- latest vs previous observed price direction
- repeated supplier lead-time observations
- pending follow-up drafts
- silent suppliers
- quotes expiring within seven days
- projects awaiting comparison
- scheduled follow-up threads

Historical sections require sufficient observations and are presented as observed signals rather than forecasts.

## Safety and trust boundaries

BidWire separates:

**AI preparation**
- BOQ generation
- supplier discovery assistance
- supplier research
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

Supplier emails and public web content are treated as untrusted input. Structured extraction is constrained by project-owned context; inbound content cannot directly choose another project's records.

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

Keep API keys in local/Convex environment configuration and out of git. AgentMail component credentials such as `AGENTMAIL_API_KEY` must be set on the Convex deployment; a frontend `.env` file does not automatically populate component-side Convex environment variables.

For inbound email testing, the AgentMail webhook must target the actual application route:

```text
https://<public-host>/agentmail/webhook
```

not merely the ngrok root.

## Demo path

1. Create a project or launch the sample job.
2. Generate/review materials.
3. Discover and select suppliers.
4. Research a supplier and inspect its evidence.
5. Map/crawl a supplier website.
6. Review published-price observations.
7. Draft and approve RFQs.
8. Send RFQs through AgentMail.
9. Reply from supplier inboxes.
10. Watch replies enter BidWire and become quotes.
11. Review Compare and Needs Review.
12. Negotiate where needed.
13. Validate and award.
14. Review award emails and explicitly send them.
15. Open **Insights** to show the procurement memory layer.

## Product principle

> **BidWire lets AI do the repetitive procurement preparation without letting AI silently make the commercial commitment.**

That principle is reflected in the data model, backend validation, email controls, review states and UI workflow.
