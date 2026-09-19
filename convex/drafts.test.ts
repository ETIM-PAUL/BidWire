import { convexTest } from "convex-test";
import { afterEach, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function signedInAs(t: ReturnType<typeof convexTest>, email: string) {
  const userId = await t.run(async (ctx) => {
    return ctx.db.insert("users", { email });
  });
  return t.withIdentity({ subject: `${userId}|test-session`, issuer: "test" });
}

const ORIGINAL_DEMO_MODE = process.env.DEMO_MODE;
const ORIGINAL_DEMO_ALLOWLIST = process.env.DEMO_ALLOWLIST;

afterEach(() => {
  if (ORIGINAL_DEMO_MODE === undefined) {
    delete process.env.DEMO_MODE;
  } else {
    process.env.DEMO_MODE = ORIGINAL_DEMO_MODE;
  }
  if (ORIGINAL_DEMO_ALLOWLIST === undefined) {
    delete process.env.DEMO_ALLOWLIST;
  } else {
    process.env.DEMO_ALLOWLIST = ORIGINAL_DEMO_ALLOWLIST;
  }
});

describe("sendRfq DEMO_MODE allowlist (Phase 5 acceptance criterion)", () => {
  test("a send to a non-allowlisted address fails loudly and is logged, without mutating state", async () => {
    process.env.DEMO_MODE = "true";
    process.env.DEMO_ALLOWLIST = "allowed@example.com";

    const t = convexTest(schema, modules);
    const asOwner = await signedInAs(t, "rfq-owner@example.com");

    const projectId = await asOwner.mutation(api.projects.createProject, {
      name: "Patio build",
      jobDescription: "New concrete patio",
      location: "Miami, FL",
      currency: "USD",
    });
    // A project needs an inbox before sendRfq will even consider sending.
    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        inboxId: "test-inbox-id",
        inboxAddress: "bidwire-test@example.com",
      });
    });

    const supplierId = await t.run(async (ctx) => {
      return ctx.db.insert("suppliers", {
        projectId,
        name: "Not Allowlisted Supplier",
        email: "not-allowed@example.com",
        source: "firecrawl",
        categories: ["Concrete"],
        status: "candidate",
      });
    });
    await asOwner.mutation(internal.drafts.insertDraft, {
      projectId,
      supplierId,
      kind: "rfq",
      subject: "Quote request",
      body: "Please quote the following items...",
    });
    const [draft] = await asOwner.query(api.drafts.listDrafts, { projectId });

    // negative: refused loudly - not silently, not sent - before ever
    // reaching AgentMail (a structured failure, not a thrown error, since a
    // throw here would roll back the event log entry below)
    const result = await asOwner.mutation(api.drafts.sendRfq, { draftId: draft._id });
    expect(result.ok).toBe(false);
    expect(result.blockedReason).toMatch(/DEMO_MODE/);

    // and logged
    const events = await asOwner.query(api.events.listEvents, { projectId });
    expect(events.some((e) => e.type === "rfq_send_blocked")).toBe(true);

    // state must be untouched: draft still pending, supplier still a candidate
    const [draftAfter] = await asOwner.query(api.drafts.listDrafts, { projectId });
    expect(draftAfter.status).toBe("pending");
    const suppliers = await asOwner.query(api.suppliers.listSuppliers, { projectId });
    expect(suppliers.find((s) => s._id === supplierId)?.status).toBe("candidate");
  });
});
