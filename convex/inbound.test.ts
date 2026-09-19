import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function signedInAs(t: ReturnType<typeof convexTest>, email: string) {
  const userId = await t.run(async (ctx) => {
    return ctx.db.insert("users", { email });
  });
  return t.withIdentity({ subject: `${userId}|test-session`, issuer: "test" });
}

function rawMessage(overrides: Record<string, unknown>) {
  return {
    message_id: "default-message-id",
    inbox_id: "bidwire-test-inbox",
    thread_id: "thread-abc",
    from: "supplier@example.com",
    subject: "Re: quote request",
    text: "Here is our quote.",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("inbound webhook processing (Phase 6 acceptance criteria)", () => {
  test("replaying the same webhook payload 3 times creates exactly one message", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await signedInAs(t, "inbox-owner@example.com");
    const projectId = await asOwner.mutation(api.projects.createProject, {
      name: "Idempotency test",
      jobDescription: "Test",
      location: "Test City",
      currency: "USD",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        inboxId: "bidwire-test-inbox",
        inboxAddress: "bidwire-test-inbox@agentmail.to",
      });
    });

    const message = rawMessage({ message_id: "replayed-message-id" });
    for (let i = 0; i < 3; i++) {
      await t.mutation(internal.inbound.onMessageReceived, {
        message,
        thread: {},
        eventId: `event-${i}`,
      });
    }

    const messages = await t.run(async (ctx) => {
      return ctx.db
        .query("messages")
        .withIndex("by_provider_message_id", (q) =>
          q.eq("providerMessageId", "replayed-message-id"),
        )
        .collect();
    });
    expect(messages).toHaveLength(1);
  });

  test("matches a reply to its supplier by sender address and creates a thread", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await signedInAs(t, "inbox-owner2@example.com");
    const projectId = await asOwner.mutation(api.projects.createProject, {
      name: "Matching test",
      jobDescription: "Test",
      location: "Test City",
      currency: "USD",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        inboxId: "bidwire-match-inbox",
        inboxAddress: "bidwire-match-inbox@agentmail.to",
      });
    });
    const supplierId = await t.run(async (ctx) => {
      return ctx.db.insert("suppliers", {
        projectId,
        name: "Matched Supplier",
        email: "matched@example.com",
        source: "demo",
        categories: ["Plumbing"],
        status: "rfq_sent",
      });
    });

    await t.mutation(internal.inbound.onMessageReceived, {
      message: rawMessage({
        message_id: "match-msg-1",
        inbox_id: "bidwire-match-inbox",
        thread_id: "real-thread-1",
        from: "matched@example.com",
      }),
      thread: {},
      eventId: "event-match-1",
    });

    const threads = await asOwner.query(api.threads.listThreads, { projectId });
    expect(threads).toHaveLength(1);
    expect(threads[0].supplierId).toBe(supplierId);
    expect(threads[0].supplierName).toBe("Matched Supplier");

    const supplier = await t.run(async (ctx) => ctx.db.get(supplierId));
    expect(supplier?.status).toBe("replied");
  });

  test("reconciles a placeholder thread ID to AgentMail's real one on first reply", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await signedInAs(t, "inbox-owner3@example.com");
    const projectId = await asOwner.mutation(api.projects.createProject, {
      name: "Reconciliation test",
      jobDescription: "Test",
      location: "Test City",
      currency: "USD",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        inboxId: "bidwire-recon-inbox",
        inboxAddress: "bidwire-recon-inbox@agentmail.to",
      });
    });
    const supplierId = await t.run(async (ctx) => {
      return ctx.db.insert("suppliers", {
        projectId,
        name: "Recon Supplier",
        email: "recon@example.com",
        source: "demo",
        categories: ["Plumbing"],
        status: "rfq_sent",
      });
    });
    // Simulates what sendRfq does: a thread seeded with a placeholder
    // providerThreadId (the outbound enqueue ID) before any reply exists.
    const threadId = await t.run(async (ctx) => {
      return ctx.db.insert("threads", {
        projectId,
        supplierId,
        providerThreadId: "placeholder-outbound-id",
        lastMessageAt: Date.now(),
        followUpsSent: 0,
      });
    });

    await t.mutation(internal.inbound.onMessageReceived, {
      message: rawMessage({
        message_id: "recon-msg-1",
        inbox_id: "bidwire-recon-inbox",
        thread_id: "real-agentmail-thread-id",
        from: "recon@example.com",
      }),
      thread: {},
      eventId: "event-recon-1",
    });

    const threadAfter = await t.run(async (ctx) => ctx.db.get(threadId));
    expect(threadAfter?.providerThreadId).toBe("real-agentmail-thread-id");

    const messages = await asOwner.query(api.threads.listMessagesForThread, { threadId });
    expect(messages).toHaveLength(1);

    // A second reply in the SAME real thread must match by provider thread
    // ID now, not create a second thread.
    await t.mutation(internal.inbound.onMessageReceived, {
      message: rawMessage({
        message_id: "recon-msg-2",
        inbox_id: "bidwire-recon-inbox",
        thread_id: "real-agentmail-thread-id",
        from: "recon@example.com",
      }),
      thread: {},
      eventId: "event-recon-2",
    });
    const threads = await asOwner.query(api.threads.listThreads, { projectId });
    expect(threads).toHaveLength(1);
    expect(threads[0].messageCount).toBe(2);
  });

  test("a message from an unrecognized sender lands in the Unmatched bucket", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await signedInAs(t, "inbox-owner4@example.com");
    const projectId = await asOwner.mutation(api.projects.createProject, {
      name: "Unmatched test",
      jobDescription: "Test",
      location: "Test City",
      currency: "USD",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, {
        inboxId: "bidwire-unmatched-inbox",
        inboxAddress: "bidwire-unmatched-inbox@agentmail.to",
      });
    });

    await t.mutation(internal.inbound.onMessageReceived, {
      message: rawMessage({
        message_id: "unmatched-msg-1",
        inbox_id: "bidwire-unmatched-inbox",
        from: "stranger@nowhere.example",
      }),
      thread: {},
      eventId: "event-unmatched-1",
    });

    const threads = await asOwner.query(api.threads.listThreads, { projectId });
    expect(threads).toHaveLength(0);
    const unmatched = await asOwner.query(api.threads.listUnmatchedMessages, { projectId });
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0].subject).toBe("Re: quote request");
  });
});

describe("Inbox tab query ownership", () => {
  test("a different user cannot read another project's threads or unmatched messages", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await signedInAs(t, "inbox-owner5@example.com");
    const asOther = await signedInAs(t, "inbox-other@example.com");
    const projectId = await asOwner.mutation(api.projects.createProject, {
      name: "Ownership test",
      jobDescription: "Test",
      location: "Test City",
      currency: "USD",
    });

    await expect(
      asOther.query(api.threads.listThreads, { projectId }),
    ).rejects.toThrow();
    await expect(
      asOther.query(api.threads.listUnmatchedMessages, { projectId }),
    ).rejects.toThrow();
  });
});
