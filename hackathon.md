# BidWire — Hackathon Build Log & Technical Overview

## 1. Product overview

BidWire is an AI-assisted procurement workspace for contractors and procurement teams. It connects the procurement lifecycle instead of treating BOQ generation, supplier search, email, quote extraction, comparison, negotiation and award as separate tools.

**Current workflow:**

Project brief → Materials / BOQ → Supplier discovery → Supplier intelligence → RFQ drafts → RFQ sending → Supplier inbox → Quote extraction → Compare → Negotiation → Award validation → Award communication → Procurement insights

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
- Supplier intelligence and research profile UI

### Backend

- Convex database and realtime queries
- Convex mutations/actions
- Convex Auth
- Convex components
- Scheduled follow-up checks
- Scheduled supplier web-monitoring refreshes

### AI / extraction

- OpenAI structured outputs for BOQ/procurement drafting and supplier quote extraction
- Firecrawl structured web research and site intelligence
- PDF.js for PDF text extraction inside the Convex Node runtime
- Deterministic unit conversion for known units

### External services

- Firecrawl for supplier discovery, structured supplier research, site mapping, durable crawling and web-price extraction
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

### 4.4 Supplier intelligence

BidWire now treats supplier discovery as the beginning of research rather than the end of search.

A supplier can be researched against the exact project context. The research prompt includes:

- project location
- project name and description
- requested materials
- specifications
- quantities and units
- supplier candidate identity
- candidate website when available

The research workflow asks Firecrawl to verify the actual business location, requested categories/items, public contact routes, relevant evidence and publicly listed prices. Location is deliberately treated as a verification constraint, not merely a search keyword.

Research results are stored with:

- research status
- researched timestamp
- researched location
- location verification state
- relevant categories
- match reasons
- evidence statements
- source URLs
- source count
- observed published prices

A supplier is marked `verified` only when the research establishes both a relevant category and a matching location. Otherwise it is marked `needs_review`.

### 4.5 Supplier research profile

The supplier detail modal now provides:

- contact information with `N/A` fallbacks
- location verification
- research status
- number of analyzed sources
- evidence for why the supplier matched
- match reasons
- relevant categories
- public source links
- published price observations
- website monitoring control

This makes the supplier selection process explainable instead of presenting an unexplained list of businesses.

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
- published supplier prices
- decision brief

A revision is detected when a later quote version changes the price for an item.

Published prices are treated as observations from supplier web pages, not as guaranteed live market prices.

### 4.12 Web price intelligence

BidWire can refresh a supplier website and use Firecrawl structured extraction to capture publicly listed procurement prices.

The system compares a new observation with the previously stored observation and records changes such as:

`Ceramic tile: 4,500 → 5,200 / carton`

Price observations retain their supplier/source context. They are not used to fabricate a quote or override an actual supplier response.

### 4.13 Website Map and Crawl

A researched supplier website can be mapped to discover relevant URLs. The user can also start a durable Firecrawl crawl of the site.

Crawls are configured through the Firecrawl Convex component and can be run in poll mode for local development. The crawl ID and completion information are retained against the supplier so the UI can expose crawl state without pretending that a crawl finished synchronously.

### 4.14 Supplier monitoring

A supplier with a website can be placed into monitoring mode. Scheduled refreshes re-read the public website and compare the newly extracted price observations with the previous snapshot.

When a change is detected, BidWire stores:

- detection timestamp
- source URL
- concise change summary
- recent change history

Monitoring is an evidence/alert mechanism, not an automatic purchasing decision.

### 4.15 Follow-ups

Non-responding supplier threads can schedule follow-up checks. The project can optionally auto-approve follow-ups, and the system caps repeated nudges.

Cancelling a project cancels pending follow-up schedules.

### 4.16 Negotiation

Negotiation can be initiated from supplier/quote context. BidWire generates an editable counter/negotiation draft. The draft is reviewed in a modal and must be approved before sending.

Negotiation is disabled after award.

### 4.17 Award validation

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

### 4.18 Award communication

Award generation prepares purchase-order and supplier-notification drafts. The user reviews the message in a modal, can edit it and explicitly chooses **Approve & send**.

The system does not silently send the final award communication.

---

## 5. Supplier intelligence UX

The Suppliers tab is designed around three questions:

### Who is this supplier?

The profile exposes identity, website, contact route, categories and current procurement status.

### Why did BidWire find them?

The research panel exposes evidence, source URLs, location verification and category relevance.

### What changed?

Published prices and monitoring history can be refreshed and reviewed without changing the actual RFQ/quote records.

This is deliberately evidence-first. BidWire does not convert incomplete research into an unexplained supplier ranking.

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
- that a website-listed price is a binding supplier quote

When there is insufficient evidence, the UI says so.

---

## 8. Trust and security boundaries

### AI is allowed to prepare

- BOQ content
- supplier discovery assistance
- supplier research
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
- supplier research ownership

### Human controls

- supplier selection
- negotiation approval
- final award communication
- interpretation of supplier research evidence

Inbound supplier email and public web content are treated as untrusted data. Structured extraction cannot directly choose another tenant/project's IDs.

---

## 9. Hackathon demo narrative

A strong demo should show the full loop rather than isolated AI features:

1. Create a real-world project.
2. Generate and review materials.
3. Discover relevant suppliers.
4. Open a supplier profile.
5. Run supplier research and show location/category evidence.
6. Map or crawl a supplier website.
7. Show a published price observation.
8. Enable monitoring for a supplier website.
9. Select suppliers.
10. Generate RFQs and show the exact scope in each draft.
11. Approve and send RFQs through AgentMail.
12. Reply from supplier inboxes.
13. Show the replies entering the BidWire Inbox.
14. Show extracted quotes in Compare.
15. Show published-price observations alongside supplier quotes.
16. Show a missing/low-confidence quote line in Needs Review.
17. Open the negotiation modal and edit the generated message.
18. Show award readiness validation.
19. Award the project.
20. Review the generated award communication and explicitly approve sending.
21. Open Insights and show the procurement memory layer.

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

### Web intelligence is advisory

Public supplier websites can inform research and price context, but they do not replace the supplier's actual RFQ response.

---

## 11. Development notes

Local development requires the Convex backend and frontend to run together:

```bash
npx convex dev
npm run dev
```

Keep API keys in local/Convex environment configuration and out of git.

For inbound email testing, the AgentMail webhook must target the actual application route:

```text
https://<public-host>/agentmail/webhook
```

not merely the ngrok root.

For Firecrawl durable crawls, local development should use `mode: "poll"` because a local Convex deployment is not publicly reachable by Firecrawl's webhook service. Cloud deployments can use the component's webhook mode.

---

## 12. Current implementation status

The current build includes the complete core procurement loop plus supplier intelligence, award communication review, historical workspace insights and operational action visibility.

The supplier-intelligence layer extends Firecrawl's role from basic supplier discovery into evidence-backed research, website mapping/crawling, structured public-price observations and monitoring. The goal is to make the data BidWire already collects useful across projects while preserving the previously working procurement flow.
