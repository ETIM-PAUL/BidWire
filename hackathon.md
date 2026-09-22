# BidWire — Hackathon Build Log & Technical Overview

## 1. Product overview

BidWire is an AI-assisted procurement workspace for contractors and procurement teams. It connects the procurement lifecycle instead of treating BOQ generation, supplier search, email, quote extraction, comparison, negotiation and award as separate tools.

**Current workflow:**

Project brief → Materials / BOQ → Supplier discovery → Supplier web intelligence → RFQ drafts → RFQ sending → Supplier inbox → Quote extraction → Compare → Negotiation → Award validation → Award communication → Procurement insights

The core product principle is human-in-the-loop: AI prepares information and communication, deterministic application logic validates important boundaries, and the contractor remains in control of supplier selection and commercial commitments.

---

## 2. Problem

Small procurement teams often move between project descriptions, spreadsheets, supplier websites, email inboxes, PDF quotations, comparison sheets and messaging tools. This creates duplicated work and makes it difficult to preserve the relationship between the original requirement, the supplier request, the supplier response and the final award.

BidWire keeps those records connected to the project.

---

## 3. Architecture

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- Responsive project workspace
- Skeleton loading states
- Toast/error feedback
- Modal review flows
- Activity feed
- Compare and decision brief views
- Supplier details and intelligence views

### Backend

- Convex database and realtime queries
- Convex mutations/actions
- Convex Auth
- Convex components
- Scheduled follow-up checks

### AI / extraction

- OpenAI structured outputs for BOQ/procurement drafting and supplier quote extraction
- Firecrawl Agent for evidence-backed supplier research
- PDF.js for PDF text extraction inside the Convex Node runtime
- Deterministic unit conversion for known units

### External services

- Firecrawl for supplier discovery and website intelligence
- AgentMail for project inboxes, outbound messages and inbound webhooks

---

## 4. End-to-end implementation

### 4.1 Project creation

A contractor supplies a project name, location, currency and natural-language job description. Optional drawings/photos/PDFs can be attached.

The project is the root context for subsequent line items, suppliers, messages, quotes and awards.

### 4.2 Materials / BOQ

The project description is transformed into structured line items with:

- name
- specification
- quantity
- unit
- category
- sort order

The editable project line items become the source of truth for sourcing and award readiness.

### 4.3 Supplier discovery

Firecrawl-backed discovery is category-aware. The goal is to return suppliers relevant to the materials actually present in the project rather than generic construction companies.

Demo suppliers exist for repeatable hackathon testing.

### 4.4 Supplier web intelligence

The Suppliers workflow now goes beyond discovery. A supplier can be researched against the actual project context.

Research receives:

- project location
- project name
- current BOQ items and categories
- supplier name
- supplier website when available

The Firecrawl research prompt explicitly asks for evidence rather than invented facts. It checks:

- actual business location
- relevance to requested materials/categories
- public contact routes
- source URLs and reasons
- publicly listed prices where available

Research results are stored with the supplier as review evidence. Location/category verification is represented explicitly so an unverified supplier is not silently treated as confirmed.

Supplier websites can also be mapped and crawled. The application stores discovered URLs and crawl metadata so the website can be revisited without turning web observations into commercial quotes.

### 4.5 Supplier selection and identity

Suppliers have a source (`firecrawl`, `manual` or `demo`), categories, email, optional phone and status.

The project's AgentMail inbox is separate from supplier recipient addresses. Demo mode can restrict outbound recipients through an allowlist.

### 4.6 RFQ drafting

BidWire generates one draft per selected supplier. The draft records the exact line-item IDs included in that supplier's RFQ.

This is important because a material removed from the active RFQ scope must not later become an award requirement simply because it still exists in the broader project materials list.

### 4.7 RFQ sending

The user reviews/approves the draft. BidWire sends through the project's AgentMail inbox and creates a project/supplier thread and outbound message record.

Events record the RFQ send operation.

### 4.8 AgentMail inbound loop

The intended loop is:

**BidWire → AgentMail → supplier → reply → AgentMail webhook → BidWire Inbox**

The webhook route is `/agentmail/webhook`.

The inbound pipeline resolves the project and supplier from the email/thread context before storing the message.

### 4.9 Quote extraction

Supplier replies can contain plain text, tables and PDF quotations. The extraction pipeline first classifies the response and then, for quote/partial-quote responses, extracts structured quote data.

Extracted fields include:

- validity date
- lead time
- delivery cost
- currency
- notes
- raw item description
- unit price
- unit
- quantity
- matched project line item
- match confidence

The LLM does not control project/supplier/message identity. Those IDs come from the application context.

### 4.10 Needs Review and deterministic normalization

Low-confidence quote matches are left unmatched and surfaced for review. A user can manually confirm a quote line against a project line item.

Known conversions such as tonne/kg, kg/g, litre/ml and metre/cm are handled by deterministic code. Unknown unit mismatches remain visible instead of being silently converted.

### 4.11 Compare

The comparison view shows supplier coverage and prices together. It supports:

- basket totals
- full-coverage comparisons
- split-award calculations
- missing items
- quote revisions
- confidence warnings
- published web-price observations
- decision brief / download view

A revision is detected when a later quote version changes the price for an item. Published website prices remain observations and are never silently promoted to supplier quotes.

### 4.12 Follow-ups

Non-responding supplier threads can schedule follow-up checks. The project can optionally auto-approve follow-ups, and the system caps repeated nudges.

Cancelling a project cancels pending follow-up schedules.

### 4.13 Negotiation

Negotiation can be initiated from supplier/quote context. BidWire generates an editable counter/negotiation draft. The draft is reviewed in a modal and must be approved before sending.

Negotiation is disabled after award.

### 4.14 Award validation

Awarding supports single-supplier and split modes. The backend derives the relevant RFQ scope and verifies that every item being awarded has a valid current quote.

The backend is authoritative: the UI readiness state is helpful, but it does not replace server validation.

After award:

- project status becomes `awarded`
- award and award lines are stored
- award events are recorded
- pending RFQ drafts are discarded
- negotiation is disabled
- supplier discovery is disabled
- material removal is disabled

### 4.15 Award communication

Award generation prepares purchase-order and supplier-notification drafts. The user reviews the message in a modal, can edit it and explicitly chooses **Approve & send**.

The system does not silently send the final award communication.

---

## 5. Supplier intelligence

The Suppliers tab includes an evidence-based intelligence layer built from current and prior workspace records when supplier identity can be matched.

Signals include:

- quote coverage
- extraction confidence
- revisions
- quote validity
- delivery cost
- observed lead time
- missing scope
- negotiation prompts

The UI explicitly describes these as review signals rather than automatic supplier recommendations.

Supplier web research is a separate evidence layer. It can add:

- verified/unverified research status
- business location evidence
- requested-category evidence
- source URLs
- public-price observations
- mapped website URLs
- crawl metadata

---

## 6. Then phase — procurement memory

The Then phase adds a workspace-level Insights view.

### 6.1 Spend memory

BidWire aggregates awarded spend by currency and shows projects with recorded award spend. It does not combine different currencies into a fake total.

### 6.2 Historical price signals

For repeated project line items with multiple observed quotes in the same unit/currency, BidWire calculates:

- observation count
- average observed unit price
- lowest observed price
- highest observed price
- latest observed price
- previous observed price
- historical direction: rising, falling or stable

This is explicitly historical evidence, not a prediction of future market price.

### 6.3 Lead-time memory

When a supplier has multiple recorded lead-time observations, BidWire shows the latest and previous observation and whether the recorded lead time moved up, down or stayed stable.

### 6.4 Operational action queue

The Insights view also surfaces:

- pending follow-up drafts
- silent suppliers
- quotes expiring within seven days
- projects waiting for comparison
- scheduled follow-up threads

This makes the product more than a transaction tool: the workspace starts retaining useful procurement memory.

---

## 7. What was deliberately not invented

The project does not currently claim:

- external market-price feeds that are not connected
- supplier quality scores without quality data
- guaranteed delivery performance
- future price predictions
- an automatic overall supplier ranking

When there is insufficient evidence, the UI says so.

---

## 8. Trust and security boundaries

### AI is allowed to prepare

- BOQ content
- supplier discovery assistance
- supplier web research
- quote extraction
- RFQ drafts
- follow-up drafts
- negotiation drafts
- award communication drafts

### Application code controls

- authenticated project ownership
- project scope
- quote/project relationships
- known unit conversions
- award readiness
- demo allowlisting
- follow-up limits
- outbound send permissions

### Human controls

- supplier selection
- negotiation approval
- final award communication

Inbound supplier email and public web content are treated as untrusted data. Structured extraction cannot directly choose another tenant/project's IDs.

---

## 9. Hackathon demo narrative

A strong demo should show the full loop rather than isolated AI features:

1. Create a real-world project.
2. Generate and review materials.
3. Discover relevant suppliers.
4. Research a supplier and inspect its evidence.
5. Map/crawl a supplier website.
6. Select suppliers.
7. Generate RFQs and show the exact scope in each draft.
8. Approve and send RFQs through AgentMail.
9. Reply from supplier inboxes.
10. Show the replies entering the BidWire Inbox.
11. Show extracted quotes in Compare.
12. Show a missing/low-confidence quote line in Needs Review.
13. Open the negotiation modal and edit the generated message.
14. Show award readiness validation.
15. Award the project.
16. Review the generated award communication and explicitly approve sending.
17. Open Insights and show the procurement memory layer.

---

## 10. Current product principles

### Connected context

Every procurement action should remain tied to the project and supplier context.

### Evidence before automation

Where the system does not have enough evidence, it should expose the gap instead of inventing an answer.

### Deterministic arithmetic

Known unit conversions and commercial calculations are handled by code, not by asking the LLM to perform business-critical arithmetic.

### Human-controlled commitment

AI can draft a message. The contractor decides whether that message should actually be sent.

### Backend authority

UI readiness states are convenience; server-side validation remains authoritative before commercial state changes.

---

## 11. Development notes

Local development requires the Convex backend and frontend to run together:

```bash
npx convex dev
npm run dev
```

AgentMail API credentials belong in Convex environment configuration for the deployment/component. Local `.env` files are not a replacement for component-side Convex environment variables.

For inbound email testing, the AgentMail webhook must target the actual application route:

```text
https://<public-host>/agentmail/webhook
```

not merely the ngrok root.

For supplier research, Firecrawl API credentials must also be available to the Convex deployment. Supplier web research uses the project's location and current BOQ context so the research prompt is grounded in the actual procurement job.

---

## 12. Current implementation status

The current build includes the complete core procurement loop plus supplier web intelligence, evidence-backed supplier review, award communication review, historical workspace insights and operational action visibility.

The goal of the Then phase is not to add speculative features for the sake of a larger feature list. It is to make the data already collected by BidWire useful across projects while preserving the previously working procurement flow.
