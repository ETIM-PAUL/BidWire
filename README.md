# BidWire — Award-Winning Hackathon Project

> **AI-powered procurement from project scope to supplier award.**

BidWire turns a messy procurement workflow into one guided loop: describe a project, generate the materials/BOQ, discover suppliers, send RFQs, receive and extract quotes, compare responses, negotiate, and award the work — with human approval before money-moving communication is sent.

## Why BidWire

Procurement teams lose time copying project requirements between spreadsheets, supplier emails, quote PDFs and comparison tables. BidWire keeps the workflow connected and makes the evidence behind each decision visible.

## What the demo does

- **AI project → BOQ:** turns a project description into structured line items.
- **Supplier discovery:** finds suppliers relevant to the project's materials and scope.
- **Real RFQs:** generates supplier-specific drafts and sends them through AgentMail.
- **Inbound procurement inbox:** receives supplier replies and keeps them attached to the right project/thread.
- **AI quote extraction:** parses email/PDF quotations into structured quote lines with review signals.
- **Comparison:** compares supplier coverage and pricing, including missing items.
- **Negotiation:** creates editable AI negotiation drafts for human approval.
- **Awarding:** supports single-supplier and split awards with readiness validation.
- **Award communications:** generates purchase-order and supplier-notification drafts; users review them in a modal and explicitly choose whether to send.
- **Follow-ups:** prepares and sends controlled follow-up nudges for non-responding suppliers.

## Built with

- React + TypeScript + Vite
- Convex for database, functions, auth and realtime state
- AgentMail for supplier email and inbound webhooks
- OpenAI for structured procurement/quote intelligence
- Firecrawl for supplier discovery
- Tailwind CSS for the application UI

## Local development

```bash
npm install
npx convex dev
npm run dev
```

Configure Convex environment variables for the services used by the demo. Keep local secrets out of git.

## Demo story

1. Create a project and generate its materials.
2. Discover/select suppliers.
3. Generate and approve RFQ drafts.
4. Reply from supplier inboxes and watch the replies enter BidWire.
5. Review extracted quotes in **Compare**.
6. Negotiate where needed.
7. Award the project.
8. Review the generated award emails in the modal and explicitly **Approve & send** the messages you want to send.

BidWire is designed around a simple principle: **AI prepares the procurement work; the human stays in control of the decision and outbound commitment.**
