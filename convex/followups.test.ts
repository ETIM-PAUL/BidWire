import { convexTest } from "convex-test";
import { afterEach, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { scheduleFollowUpCheck } from "./followups";
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
  if (ORIGINAL_DEMO_MODE === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = ORIGINAL_DEMO_MODE;
  if (ORIGINAL_DEMO_ALLOWLIST === undefined) delete process.env.DEMO_ALLOWLIST;
  else process.env.DEMO_ALLOWLIST = ORIGINAL_DEMO_ALLOWLIST;
});

async function seedProjectWithThread(t: ReturnType<typeof convexTest>, email: string) {
  const asOwner = await signedInAs(t, email);
  const projectId = await asOwner.mutation(api.projects.createProject, {
    name: "Follow-up test",
    jobDescription: "Test",
    location: "Test City",
    currency: "USD",
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(projectId, {
      inboxId: "test-inbox",
      inboxAddress: "test-inbox@example.com",
    });
  });
  const supplierId = await t.run(async (ctx) =>
    ctx.db.insert("suppliers", {
      projectId,
      name: "Test Supplier",
      email: "supplier@example.com",
      source: "demo",
      categories: ["Masonry"],
      status: "rfq_sent",
    }),
  );
  const threadId = await t.run(async (ctx) =>
    ctx.db.insert("threads", {
      projectId,
      supplierId,
      providerThreadId: "placeholder-outbound-id",
      lastMessageAt: Date.now(),
      followUpsSent: 0,
    }),
  );
  await t.run(async (ctx) => {
    await ctx.db.insert("messages", {
      threadId,
      projectId,
      supplierId,
      providerMessageId: "placeholder-outbound-id",
      direction: "out",
      subject: "RFQ: materials needed",
      bodyText: "Please quote",
      attachmentIds: [],
      receivedAt: Date.now(),
      processed: true,
    });
  });
  return { asOwner, projectId, supplierId, threadId };
}

describe("scheduleFollowUpCheck", () => {
  test("schedules a check and remembers the scheduled function ID on the thread", async () => {
    const t = convexTest(schema, modules);
    const { threadId } = await seedProjectWithThread(t, "sched-owner@example.com");

    const before = await t.run(async (ctx) => ctx.db.get(threadId));
    expect(before?.pendingFollowUpScheduledId).toBeUndefined();

    await t.run(async (ctx) => scheduleFollowUpCheck(ctx, threadId));

    const after = await t.run(async (ctx) => ctx.db.get(threadId));
    expect(after?.pendingFollowUpScheduledId).toBeDefined();
  });
});

describe("setAutoApproveFollowUps", () => {
  test("toggles the setting for the owner; refuses a different user", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await signedInAs(t, "toggle-owner@example.com");
    const asOther = await signedInAs(t, "toggle-other@example.com");
    const projectId = await asOwner.mutation(api.projects.createProject, {
      name: "Toggle test",
      jobDescription: "Test",
      location: "Test City",
      currency: "USD",
    });

    await asOwner.mutation(api.followups.setAutoApproveFollowUps, {
      projectId,
      enabled: true,
    });
    const project = await asOwner.query(api.projects.getProject, { projectId });
    expect(project.autoApproveFollowUps).toBe(true);

    await expect(
      asOther.mutation(api.followups.setAutoApproveFollowUps, { projectId, enabled: false }),
    ).rejects.toThrow();
  });
});

describe("sendFollowUpDraft", () => {
  test("DEMO_MODE blocks a send to a non-allowlisted address, loudly and logged", async () => {
    process.env.DEMO_MODE = "true";
    process.env.DEMO_ALLOWLIST = "allowed@example.com";
    const t = convexTest(schema, modules);
    const { asOwner, projectId, supplierId } = await seedProjectWithThread(
      t,
      "followup-block@example.com",
    );
    const draftId = await t.run(async (ctx) =>
      ctx.db.insert("drafts", {
        projectId,
        supplierId,
        kind: "follow_up",
        subject: "Following up",
        body: "Just checking in",
        status: "pending",
      }),
    );

    const result = await asOwner.mutation(api.followups.sendFollowUpDraft, { draftId });
    expect(result.ok).toBe(false);
    expect(result.blockedReason).toMatch(/DEMO_MODE/);

    const events = await asOwner.query(api.events.listEvents, { projectId });
    expect(events.some((e) => e.type === "rfq_send_blocked")).toBe(true);
    const draftAfter = await t.run(async (ctx) => ctx.db.get(draftId));
    expect(draftAfter?.status).toBe("pending");
  });

  test("refuses a non-follow_up draft, a non-pending draft, and a different user", async () => {
    const t = convexTest(schema, modules);
    const { asOwner, projectId, supplierId } = await seedProjectWithThread(
      t,
      "followup-precond@example.com",
    );
    const asOther = await signedInAs(t, "followup-other@example.com");

    const rfqDraftId = await t.run(async (ctx) =>
      ctx.db.insert("drafts", {
        projectId,
        supplierId,
        kind: "rfq",
        subject: "RFQ",
        body: "body",
        status: "pending",
      }),
    );
    await expect(
      asOwner.mutation(api.followups.sendFollowUpDraft, { draftId: rfqDraftId }),
    ).rejects.toThrow(/Not a follow-up draft/);

    const sentDraftId = await t.run(async (ctx) =>
      ctx.db.insert("drafts", {
        projectId,
        supplierId,
        kind: "follow_up",
        subject: "Following up",
        body: "body",
        status: "sent",
      }),
    );
    await expect(
      asOwner.mutation(api.followups.sendFollowUpDraft, { draftId: sentDraftId }),
    ).rejects.toThrow(/not pending/);

    const pendingDraftId = await t.run(async (ctx) =>
      ctx.db.insert("drafts", {
        projectId,
        supplierId,
        kind: "follow_up",
        subject: "Following up",
        body: "body",
        status: "pending",
      }),
    );
    await expect(
      asOther.mutation(api.followups.sendFollowUpDraft, { draftId: pendingDraftId }),
    ).rejects.toThrow();
  });
});

describe("checkFollowUp (paths that never reach the LLM call)", () => {
  test("a supplier who already replied is left alone - no draft, no silent", async () => {
    const t = convexTest(schema, modules);
    const { projectId, supplierId, threadId } = await seedProjectWithThread(
      t,
      "checkfollowup-replied@example.com",
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(supplierId, { status: "replied" });
    });

    await t.action(internal.followupCheck.checkFollowUp, { threadId });

    const drafts = await t.run(async (ctx) =>
      ctx.db
        .query("drafts")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect(),
    );
    expect(drafts).toHaveLength(0);
    const supplier = await t.run(async (ctx) => ctx.db.get(supplierId));
    expect(supplier?.status).toBe("replied");
  });

  test("a cancelled project's thread is left alone", async () => {
    const t = convexTest(schema, modules);
    const { projectId, supplierId, threadId } = await seedProjectWithThread(
      t,
      "checkfollowup-cancelled@example.com",
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(projectId, { status: "cancelled" });
    });

    await t.action(internal.followupCheck.checkFollowUp, { threadId });

    const supplier = await t.run(async (ctx) => ctx.db.get(supplierId));
    expect(supplier?.status).toBe("rfq_sent"); // untouched
  });

  test("a supplier already at the nudge cap is marked silent, no new draft", async () => {
    const t = convexTest(schema, modules);
    const { projectId, supplierId, threadId } = await seedProjectWithThread(
      t,
      "checkfollowup-cap@example.com",
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(threadId, { followUpsSent: 2 });
    });

    await t.action(internal.followupCheck.checkFollowUp, { threadId });

    const supplier = await t.run(async (ctx) => ctx.db.get(supplierId));
    expect(supplier?.status).toBe("silent");
    const drafts = await t.run(async (ctx) =>
      ctx.db
        .query("drafts")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect(),
    );
    expect(drafts).toHaveLength(0);
  });

  test("a supplier with an existing pending nudge is not given a second one", async () => {
    const t = convexTest(schema, modules);
    const { projectId, supplierId, threadId } = await seedProjectWithThread(
      t,
      "checkfollowup-dupe@example.com",
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("drafts", {
        projectId,
        supplierId,
        kind: "follow_up",
        subject: "Existing nudge",
        body: "Already drafted",
        status: "pending",
      });
    });

    // Would otherwise reach the LLM call (no OPENAI_API_KEY here) if the
    // duplicate-draft guard didn't return early first.
    await t.action(internal.followupCheck.checkFollowUp, { threadId });

    const drafts = await t.run(async (ctx) =>
      ctx.db
        .query("drafts")
        .withIndex("by_supplier", (q) => q.eq("supplierId", supplierId))
        .collect(),
    );
    expect(drafts).toHaveLength(1);
  });
});

describe("cancelProject", () => {
  test("cancels a pending scheduled function and marks the project cancelled", async () => {
    const t = convexTest(schema, modules);
    const { asOwner, projectId, supplierId, threadId } = await seedProjectWithThread(
      t,
      "cancel-owner@example.com",
    );

    // Use a safe, non-LLM target for this test's own scheduling so we can
    // verify cancellation deterministically without touching OpenAI/AgentMail.
    const scheduledId = await t.run(async (ctx) =>
      ctx.scheduler.runAfter(60_000, internal.suppliers.markReplied, { supplierId }),
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(threadId, { pendingFollowUpScheduledId: scheduledId });
    });

    await asOwner.mutation(api.followups.cancelProject, { projectId });

    const project = await t.run(async (ctx) => ctx.db.get(projectId));
    expect(project?.status).toBe("cancelled");
    const thread = await t.run(async (ctx) => ctx.db.get(threadId));
    expect(thread?.pendingFollowUpScheduledId).toBeUndefined();

    // The cancelled function must never actually run: advancing past its
    // delay should NOT flip the supplier to "replied".
    await t.finishAllScheduledFunctions(() => {});
    const supplier = await t.run(async (ctx) => ctx.db.get(supplierId));
    expect(supplier?.status).toBe("rfq_sent");
  });

  test("a non-cancelled control thread's scheduled function DOES run (proves the mechanism itself works)", async () => {
    const t = convexTest(schema, modules);
    const { supplierId } = await seedProjectWithThread(t, "control-owner@example.com");

    await t.run(async (ctx) =>
      ctx.scheduler.runAfter(0, internal.suppliers.markReplied, { supplierId }),
    );
    await t.finishAllScheduledFunctions(() => {});

    const supplier = await t.run(async (ctx) => ctx.db.get(supplierId));
    expect(supplier?.status).toBe("replied");
  });

  test("a different user cannot cancel someone else's project", async () => {
    const t = convexTest(schema, modules);
    const { projectId } = await seedProjectWithThread(t, "cancel-owner2@example.com");
    const asOther = await signedInAs(t, "cancel-other@example.com");
    await expect(
      asOther.mutation(api.followups.cancelProject, { projectId }),
    ).rejects.toThrow();
  });
});
