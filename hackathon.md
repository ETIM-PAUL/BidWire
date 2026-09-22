# BidWire — Hackathon Build Log & Technical Overview

## 1. Project overview

**BidWire** is an AI-assisted procurement workspace built for contractors and small procurement teams. It connects the full RFQ lifecycle in one application instead of forcing the user to move between a project brief, spreadsheet/BOQ, supplier websites, email threads, quote PDFs, comparison sheets, negotiation messages and award communications.

The core workflow is:

**Project brief → Materials / BOQ → Supplier discovery → RFQ drafting → RFQ sending → Supplier replies → Quote extraction → Comparison → Negotiation → Award validation → Award communication**

The application is deliberately human-in-the-loop. AI handles repetitive preparation, extraction and drafting, while the contractor remains responsible for supplier selection, negotiation approval and final outbound award communication.

---

## 2. The problem we are solving

Small contractors often run procurement manually. A typical job requires the contractor to:

1. Read a project description and work out what materials are required.
2. Build a bill of quantities or materials list.
3. Search for relevant suppliers.
4. Contact several suppliers individually.
5. Keep track of which suppliers received an RFQ.
6. Read replies that may arrive as plain email, formatted text or PDF quotations.
7. Manually copy prices into a comparison sheet.
8. Work out which supplier covers which items.
9. Follow up with suppliers who have not replied.
10. Negotiate where prices or coverage need clarification.
11. Decide whether to award to one supplier or split the award.
12. Send the final supplier communication.

This creates fragmented information and repeated manual work. It also makes it easy to lose the relationship between the original project requirements, the RFQ that was sent, the supplier's response and the eventual award.

BidWire treats procurement as one connected workflow and preserves that context throughout the process.

---

## 3. Product vision

BidWire is intended to feel less like a collection of procurement utilities and more like a procurement operating layer around the contractor's project.

The product should answer three questions at every stage:

- **What do I need?** — project scope and structured materials.
- **What can suppliers provide?** — RFQs, replies, extracted quotes and comparison.
- **What should I do next?** — follow-ups, negotiation drafts, award readiness and final communications.

The AI does not replace the contractor's procurement decision. It prepares the information required to make that decision faster and more consistently.

---

## 4. Current technology stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- Responsive application layout
- Skeleton/loading states
- Toast/alert feedback
- Modal-based review workflows
- Activity and status-oriented UI

### Backend

- Convex
- Convex Auth
- Convex queries, mutations and actions
- Convex component architecture
- Realtime project state

### AI

- OpenAI for structured extraction, procurement intelligence and drafting
- Structured outputs and validation around LLM-generated procurement data

### Supplier discovery

- Firecrawl for web discovery and page extraction
- Category-aware supplier discovery based on project/material requirements
- Supplier selection before RFQ dispatch

### Email infrastructure

- AgentMail for project inboxes and outbound RFQs
- AgentMail inbound webhooks for supplier replies
- Thread-aware email handling
- Demo-mode supplier inboxes and allowlisting for local testing

---

## 5. End-to-end demo flow

### Step 1 — Create a project

The user starts with a project name, location, currency and job description.

For example, a contractor can describe a bathroom renovation in normal language rather than first constructing a spreadsheet.

The project becomes the root context for the rest of the procurement workflow.

### Step 2 — Generate the materials / BOQ

The project description is transformed into structured procurement line items.

The user can review and edit the generated materials before sourcing suppliers. Materials can also be associated with project attachments where required.

The important design decision is that the editable project materials become the source of truth for subsequent procurement actions.

### Step 3 — Discover suppliers

BidWire uses Firecrawl-based discovery to find suppliers relevant to the project's actual materials and categories.

The discovery workflow was tightened so that a project such as a bathroom renovation does not simply return generic construction businesses. Supplier discovery is intended to remain aligned with the material categories required by the project.

Demo suppliers can also be used to make the full workflow reproducible during a hackathon demonstration.

### Step 4 — Select suppliers

The contractor reviews the discovered suppliers and selects the suppliers to contact.

Supplier email identity is treated separately from the project's own AgentMail inbox so the application's outbound sender and the supplier recipient are not accidentally conflated.

### Step 5 — Draft RFQs

BidWire generates supplier-specific RFQ drafts from the project's current procurement scope.

The RFQ contains the requested materials and quantities that belong to the active RFQ scope. The implementation was refined so that removed materials do not continue to appear as valid award requirements later in the workflow.

The user can review the draft before sending.

### Step 6 — Send RFQs

Approved RFQs are sent through AgentMail.

Each project can have its own procurement inbox, allowing inbound supplier replies to remain associated with the correct project.

The system also records procurement events such as RFQ creation/sending so the activity history explains what happened.

### Step 7 — Receive supplier replies

Supplier replies are delivered back through AgentMail.

AgentMail webhooks notify the application when a message is received. BidWire verifies the webhook and processes the incoming message so that it can be attached to the appropriate project/thread.

This creates the intended loop:

**BidWire → supplier email → supplier reply → AgentMail → BidWire inbox**

Webhook configuration and local development were explicitly tested during the build because outbound email can work even when inbound webhook delivery is not configured correctly.

### Step 8 — Extract quotes

Supplier replies may contain:

- Plain text prices
- Multiple line items
- Quantities and units
- Delivery information
- Validity periods
- Qualification notes
- PDF quotations

BidWire uses AI-assisted extraction to turn this unstructured information into structured quote lines.

Extraction is not treated as unquestionable truth. Matching and validation are performed against project-owned line items so a supplier response cannot silently create arbitrary project materials.

### Step 9 — Compare supplier quotes

The Compare workflow turns supplier responses into a procurement decision workspace.

It can expose:

- Supplier coverage
- Quoted items
- Missing items
- Unit prices
- Totals
- Currency
- Coverage gaps
- Single-supplier award calculations
- Split-award possibilities

This is important because the cheapest apparent supplier is not necessarily the supplier covering the complete requirement. BidWire keeps coverage visible alongside price.

### Step 10 — Follow up

For suppliers who have not responded, BidWire can prepare controlled follow-up messages.

Follow-ups are associated with the procurement workflow rather than being independent email messages, so the user can understand why the follow-up was generated.

### Step 11 — Negotiate

The user can initiate negotiation from a supplier context after reviewing a quote.

BidWire prepares an editable negotiation draft based on the project, supplier, currency and relevant quoted items.

The negotiation draft is presented as a modal rather than forcing the user into a separate page. This keeps the comparison context visible while the contractor reviews the proposed message.

Negotiation remains human-approved: AI prepares the draft, but the user decides whether it is appropriate to send.

Once a project has been awarded, negotiation is disabled because the procurement decision has already been committed.

### Step 12 — Validate the award

Before awarding, BidWire validates that the selected supplier actually has a usable quote for the requested award items.

This prevents a project from being awarded against a line item for which the selected supplier has no quote.

Awarding supports both:

- Single-supplier awards
- Split awards across suppliers

The award workflow also records audit/activity events, including validation failures.

### Step 13 — Award communication

After the award is created, BidWire generates supplier communication drafts.

These can include:

- Purchase-order style award communication for the winning supplier
- Decline/notification communication for suppliers that were not selected
- Project/material details
- Delivery address
- Requested delivery date

The communication is intentionally **not sent automatically**.

The user opens a modal, reviews the generated subject and body, edits anything necessary, and explicitly chooses **Approve & send**.

This is a core product principle: AI can prepare the commitment, but the human makes the final outbound decision.

---

## 6. Human-in-the-loop design

BidWire is not designed around autonomous procurement without oversight.

The system separates three kinds of work:

### AI preparation

Examples:

- Turning project descriptions into materials
- Extracting supplier information
- Extracting quote lines
- Drafting RFQs
- Drafting follow-ups
- Drafting negotiation messages
- Drafting award communications

### Application validation

Examples:

- Project ownership checks
- Supplier/project relationships
- RFQ scope tracking
- Quote-to-project line-item matching
- Award readiness checks
- Award-state restrictions
- Webhook verification

### Human decision

Examples:

- Selecting suppliers
- Approving RFQs
- Reviewing extracted quotes
- Negotiating
- Selecting an award strategy
- Approving final award emails

This separation is intentional. It makes the application useful without pretending that an LLM should independently make procurement commitments.

---

## 7. AgentMail architecture and lessons learned

AgentMail became an important part of the build because BidWire is an email-driven procurement product rather than a simulated messaging interface.

The implementation uses AgentMail for:

- Project inbox provisioning
- Outbound RFQs
- Supplier replies
- Threaded messages
- Follow-ups
- Negotiation messages
- Award communications
- Webhook delivery

### Sender versus recipient

One issue discovered during testing was that the AgentMail dashboard can make a message look confusing when the same inbox identity appears as both sender and recipient in demo flows.

The application was therefore adjusted around the distinction between:

- The project's AgentMail inbox/sender identity
- The supplier's email address
- Demo supplier identities

The supplier email must remain the recipient when BidWire sends an RFQ.

### Inbound webhook configuration

Outbound email alone does not make replies appear in BidWire.

The AgentMail webhook must be configured against the application's webhook endpoint, for example:

`https://<ngrok-host>/agentmail/webhook`

rather than only the ngrok host root.

During development we inspected AgentMail webhook configuration directly and verified that the webhook was enabled for `message.received` events.

This was a key debugging lesson: when outbound email appears in AgentMail but inbound replies do not appear in the application, the next place to inspect is webhook registration and delivery rather than the RFQ sender logic.

### Local development

The application uses Convex environment variables for server-side credentials such as the AgentMail API key. A normal frontend `.env` file is not a substitute for Convex deployment/component environment variables.

The AgentMail Convex component expects `AGENTMAIL_API_KEY` on the relevant Convex environment/component deployment.

---

## 8. Demo mode

A demo procurement product needs deterministic data and safe test recipients.

BidWire therefore supports demo-mode controls, including an allowlist for approved demo supplier email addresses and demo supplier identities/inboxes.

This makes it possible to demonstrate the full workflow without accidentally sending procurement messages to arbitrary addresses.

Demo mode also makes the hackathon presentation repeatable:

1. Create a known project.
2. Generate known materials.
3. Select known suppliers.
4. Send to approved demo inboxes.
5. Reply from those inboxes.
6. Observe the response in BidWire.
7. Compare and award.

---

## 9. Reliability and validation work completed

A significant portion of the build was spent on making the happy-path demo survive real interactions rather than only rendering a UI.

### Project ownership

Project-scoped Convex functions perform ownership checks so users cannot operate on another user's project data through a manipulated client request.

### RFQ scope tracking

The RFQ scope is treated as a first-class concept. This matters when a user edits or removes materials after an RFQ has been prepared.

The award workflow should validate against the items that were actually part of the procurement scope rather than blindly assuming that every historical material remains awardable.

### Quote validation

A supplier cannot be selected for an item simply because the project contains that item. There must be a corresponding supplier quote for the requested award line.

### Idempotent inbound handling

Inbound message processing is designed to avoid processing the same webhook/message more than once.

### Webhook verification

AgentMail webhook requests are verified before inbound processing.

### Structured AI outputs

AI-generated extraction and procurement data is validated instead of being passed through as arbitrary untyped application state.

### Award-state restrictions

After a project is awarded:

- Pending RFQ drafts are discarded/invalidated as appropriate.
- Negotiation is disabled.
- Further procurement actions that would contradict the awarded state are blocked.

### Award audit trail

Award-related activity includes events for important state transitions and validation failures, making the workflow easier to debug and easier to explain during a demonstration.

---

## 10. UI and product-design improvements

The first functional version of BidWire was intentionally utilitarian. As the workflow matured, the UI was redesigned around the actual procurement journey.

Key improvements include:

- Modernised authentication screens
- Responsive application shell
- Project-oriented workspace tabs
- Skeleton loading states across the application
- Better empty states
- Toast-based feedback rather than browser `alert()` boxes
- Modal workflows for negotiation and award-email review
- Activity/status feedback
- Supplier cards
- Comparison-oriented layouts
- Clear award states
- Disabled actions when an action is no longer valid

The goal is to make the application feel like a focused procurement product rather than a collection of CRUD screens.

---

## 11. Important bugs encountered and addressed during development

### AgentMail inbox limit

The AgentMail plan initially limited the number of available inboxes. This surfaced while automatically provisioning demo/project inboxes.

The application was adapted around demo inbox provisioning and allowlisted identities rather than assuming unlimited inbox creation.

### Supplier has no email on file

RFQ sending initially failed when a selected supplier did not have a usable email address.

The flow was changed so supplier email identity is explicitly required/configured before sending.

### Convex component environment variables

The AgentMail Convex component requires its own server-side environment configuration. Having a value in a local frontend `.env` file does not automatically make it available to the Convex component.

This distinction was important while debugging `AGENTMAIL_API_KEY` errors.

### Missing inbound messages

Outbound RFQs could successfully reach AgentMail while supplier replies failed to appear in BidWire.

The debugging path exposed the need for an enabled `message.received` AgentMail webhook pointing to `/agentmail/webhook`.

### Awarding an unquoted material

The award flow surfaced cases where the selected supplier had no quote for a requested line item.

The application now validates award readiness rather than allowing an invalid award to proceed silently.

### Stale materials after RFQ editing

Materials removed from the active RFQ could remain present elsewhere in the project workflow and later cause confusing award failures.

The procurement workflow was tightened around the RFQ scope and award validation.

### Convex return validators

A project could acquire award metadata such as `awardId` and `awardedAt` while a query validator still described the older project shape.

This was caught by Convex runtime validation and the schema/query contract was corrected rather than ignoring the error.

### TypeScript schema drift

Convex typechecking exposed mismatches between event unions and mutation/query arguments during development.

These were fixed as part of keeping generated application types and server contracts aligned.

### Negotiation draft callback mismatch

The negotiation UI exposed a callback mismatch (`onDraftReady is not a function`) when launched from the supplier card.

This reinforced the need for shared modal contracts between the supplier and negotiation workflows.

---

## 12. Data and workflow model

At a conceptual level, BidWire revolves around these entities:

### User

Owns projects and controls procurement actions.

### Project

Contains the job description, location, currency, project status and project inbox.

### Material / BOQ item

Represents a procurement requirement derived from the project.

### Supplier

Represents a business that can receive an RFQ and submit a quotation.

### RFQ draft

Represents a proposed outbound supplier request before approval/sending.

### RFQ scope

Represents the actual items requested from a supplier and is important for downstream award validation.

### Inbox / thread / message

Represents the email communication between BidWire and suppliers.

### Quote / quote line

Represents structured supplier pricing extracted from a response.

### Negotiation draft

Represents an AI-prepared message that requires human review before sending.

### Award

Represents the final supplier allocation for the project or individual line items.

### Event

Represents an important workflow transition for auditability and debugging.

---

## 13. Why the workflow matters

The individual AI features are useful, but the stronger product idea is the connection between them.

A generic LLM can generate a list of materials. A web crawler can find companies. An email API can send messages. A PDF parser can extract prices. A spreadsheet can compare totals.

BidWire combines these operations around one persistent project context.

That means the system can preserve the relationship between:

**what the contractor asked for → what suppliers were contacted → what each supplier quoted → what was negotiated → what was awarded → what communication was finally sent.**

That continuity is the central product value.

---

## 14. What makes the hackathon demo compelling

The strongest demonstration is not a static AI response. It is the complete loop.

A recommended live demo is:

1. Open BidWire.
2. Create or load a sample project.
3. Show the generated materials.
4. Edit the materials if necessary.
5. Discover relevant suppliers.
6. Select several suppliers.
7. Generate RFQs.
8. Review and send the RFQs.
9. Open the supplier/demo inbox.
10. Reply with realistic quote information.
11. Return to BidWire and show the inbound thread.
12. Show AI extraction of the supplier quote.
13. Open Compare.
14. Highlight coverage and missing items.
15. Open negotiation for a supplier.
16. Review/edit the AI negotiation draft.
17. Send the negotiation message if desired.
18. Refresh Compare when the supplier responds.
19. Award the project or split the award.
20. Open the award-email modal.
21. Review/edit the purchase-order communication.
22. Explicitly approve and send it.
23. Show the resulting activity/event trail.

This tells a complete story in which every AI capability produces a concrete procurement outcome.

---

## 15. Product principles established during the build

### 1. AI prepares; humans decide

AI can accelerate preparation, but procurement commitments remain user-controlled.

### 2. Every action should retain project context

A supplier reply should not become an orphan email. A quote should not become an isolated table row. A negotiation should remain connected to the supplier and project.

### 3. Validation is part of the product

It is not enough to generate a plausible answer. The system must check whether an operation is valid against application state.

### 4. Real integrations matter

AgentMail and Firecrawl are used as real infrastructure in the workflow rather than being represented only by mock UI.

### 5. The demo should fail safely

Invalid supplier data, missing quotes, unavailable inboxes and webhook problems should produce understandable errors rather than silent incorrect procurement actions.

### 6. State should determine available actions

Once a project is awarded, actions such as negotiation should no longer be presented as if they were still valid.

---

## 16. Security and operational considerations

The project has been developed with the following considerations:

- Server-side API keys are kept in Convex environment configuration rather than frontend source code.
- Local environment files should remain ignored by git.
- Project-scoped functions check ownership.
- AgentMail webhook signatures are verified.
- Demo supplier addresses can be restricted through an allowlist.
- AI outputs are validated before becoming procurement state.
- Award operations validate supplier quote coverage.
- Outbound award communication requires explicit user approval.

Secrets displayed during debugging should be rotated if they were ever exposed in source control, screenshots, chat logs or public repositories.

---

## 17. Current feature set

At the current stage, BidWire includes:

- Authentication
- Project creation
- Project workspace
- AI-assisted materials/BOQ generation
- Editable materials
- Project attachments
- Supplier discovery
- Demo suppliers
- Supplier selection
- Supplier email configuration
- RFQ drafting
- RFQ approval/sending
- Project AgentMail inboxes
- Supplier reply threads
- AgentMail inbound webhooks
- AI quote extraction
- PDF quote extraction
- Quote confidence/review signals
- Comparison matrix
- Supplier coverage analysis
- Missing quote detection
- Follow-up drafts
- Negotiation drafts
- Negotiation modal workflow
- Award readiness validation
- Single-supplier awards
- Split awards
- Award audit events
- Purchase-order/award email drafts
- Decline/notification email drafts
- Award email review modal
- Explicit approve-and-send action
- Post-award negotiation blocking
- Pending RFQ draft cleanup after award
- Activity/status feedback
- Loading skeletons
- Responsive UI
- Demo mode and supplier allowlisting

---

## 18. What was learned

The project evolved from a functional prototype into a more reliable end-to-end system by testing the workflow with actual messages rather than only testing individual screens.

Several lessons stood out:

**Email integrations have two directions.** Sending a message successfully does not prove that inbound replies are configured. Webhooks need their own setup and debugging path.

**AI output needs application-level validation.** A quote extractor can produce a structurally valid response that still does not correspond to the project's actual line items. Domain validation is therefore essential.

**Procurement state is more important than individual screens.** Removing an item, awarding a supplier or sending an RFQ changes what should be possible elsewhere in the application.

**Demo infrastructure must be reproducible.** Allowlisted suppliers and controlled inboxes make a hackathon demonstration much safer and easier to repeat.

**Human approval is a feature, not friction.** For procurement, the final email is part of the business commitment. Giving the user a clear review step makes the AI workflow more trustworthy.

**The last 20% of an AI product is integration and state management.** Generating a draft is relatively easy. Correctly connecting that draft to the right project, supplier, scope, thread, status and eventual award is where the product becomes useful.

---

## 19. Future roadmap

Potential next steps include:

### Procurement intelligence

- Historical supplier performance
- Delivery reliability tracking
- Price history
- Supplier response-time analytics
- Automatic detection of unusual quote changes
- Better landed-cost calculations

### Supplier intelligence

- Supplier profiles and capabilities
- Verified contact information
- Geographic delivery coverage
- Preferred-supplier lists
- Supplier performance history across projects

### Quote intelligence

- Better PDF/table extraction
- Automatic clarification requests for ambiguous quotes
- Tax and delivery-cost normalization
- Lead-time comparison
- Quote expiry tracking

### Workflow automation

- Scheduled follow-ups
- Supplier response deadlines
- Escalation reminders
- Automated inbox classification
- Configurable approval policies

### Collaboration

- Team members and procurement roles
- Shared projects
- Approval chains
- Comments and internal notes
- Audit history export

### Commercial workflow

- Purchase-order numbering
- Contract generation
- Delivery confirmation
- Invoice matching
- Procurement-to-payment tracking

### AI assistant

A future BidWire assistant could answer project-specific questions such as:

- Which suppliers have responded?
- Which items are still uncovered?
- Which supplier quoted the lowest price for each item?
- What changed after negotiation?
- What still needs approval before the project can be awarded?

The assistant should answer from project evidence rather than inventing procurement facts.

---

## 20. Hackathon positioning

BidWire is best understood as an **AI procurement agent with a human-controlled execution layer**.

The project demonstrates more than an LLM prompt. It combines:

- Natural-language project understanding
- Structured procurement generation
- Web-based supplier discovery
- Real email infrastructure
- Inbound event processing
- AI document/email extraction
- Quote normalization
- Procurement comparison
- Negotiation drafting
- Award validation
- Human approval
- Realtime application state

The result is a practical workflow where AI reduces the administrative burden of procurement while the contractor remains in control of the commercial decision.

---

## 21. One-minute pitch

> **BidWire turns a contractor's job description into an end-to-end procurement workflow.**
>
> Instead of manually building a materials list, searching for suppliers, emailing RFQs, reading quote PDFs and comparing spreadsheets, the contractor gives BidWire the project scope. BidWire structures the materials, finds relevant suppliers, drafts and sends RFQs, receives supplier replies, extracts the quotes, compares coverage and pricing, prepares negotiation messages and validates the final award. At the final commitment point, the human stays in control: BidWire drafts the award email, but the contractor reviews and explicitly approves it before anything is sent.
>
> **The idea is simple: AI does the procurement preparation; the contractor makes the procurement decision.**

---

## 22. Repository / development notes

Local development uses the standard frontend and Convex development processes:

```bash
npm install
npx convex dev
npm run dev
```

Keep Convex server-side credentials in the appropriate Convex environment configuration and keep local `.env` files out of version control.

For AgentMail inbound development, the local webhook endpoint must be publicly reachable, for example through ngrok, and AgentMail must be configured to send `message.received` events to:

```text
https://<public-host>/agentmail/webhook
```

When debugging email:

1. Confirm the RFQ exists in AgentMail.
2. Confirm the recipient is the intended supplier inbox.
3. Confirm the supplier reply reaches AgentMail.
4. Confirm the webhook exists and is enabled.
5. Confirm the webhook targets `/agentmail/webhook`.
6. Confirm the local tunnel is running.
7. Confirm Convex is running.
8. Inspect the Convex event/inbox state.
9. Only then debug quote extraction or comparison.

This sequence prevents treating an infrastructure/webhook problem as an AI extraction problem.

---

## 23. Final project statement

BidWire was built around a simple observation: procurement is not one AI task. It is a chain of connected decisions, communications and validations.

The project therefore focuses on connecting the entire chain while keeping the contractor in control.

**Describe the job. Build the requirement. Find the suppliers. Ask for quotes. Understand the replies. Compare the options. Negotiate. Award. Communicate.**

That is the BidWire workflow.
