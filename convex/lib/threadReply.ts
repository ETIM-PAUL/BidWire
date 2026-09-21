import { AgentMail } from "@agentmail/convex";
import type { Id } from "../_generated/dataModel";
import { components } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";

const agentmail = new AgentMail(components.agentmail);

export type ThreadReplyResult = { ok: true } | { ok: false; blockedReason: string };

// Shared by followups.ts's performFollowUpSend and negotiate.ts's send
// logic - any code path that replies to a supplier in their existing
// thread. Enforces the DEMO_MODE allowlist (this app's non-negotiable
// rule: every outbound send must respect it) before ANY send is attempted,
// then resolves AgentMail's real message ID for the thread's original
// outbound message (only knowable after the fact, since sending is
// async-enqueued) to reply properly in-thread, falling back to a fresh
// "Re:" message if that isn't resolvable yet.
//
// Deliberately does NOT touch draft status or any caller-specific
// bookkeeping (follow-up counts, negotiation state) - that stays with each
// caller, which knows what kind of send this is.
export async function replyInThread(
  ctx: MutationCtx,
  args: {
    projectId: Id<"projects">;
    supplierId: Id<"suppliers">;
    blockedEventType: string;
    body: string;
  },
): Promise<ThreadReplyResult> {
  const supplier = await ctx.db.get(args.supplierId);
  if (!supplier) {
    throw new Error("Supplier not found");
  }
  if (!supplier.email) {
    throw new Error("Supplier has no email on file");
  }
  const project = await ctx.db.get(args.projectId);
  if (!project) {
    throw new Error("Project not found");
  }
  if (!project.inboxId) {
    throw new Error("Project has no inbox yet");
  }

  if (process.env.DEMO_MODE === "true") {
    const allowlist = (process.env.DEMO_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
    if (!allowlist.includes(supplier.email.toLowerCase())) {
      await ctx.db.insert("events", {
        projectId: args.projectId,
        type: args.blockedEventType,
        payload: {
          supplierId: args.supplierId,
          email: supplier.email,
          reason: "DEMO_MODE: recipient is not on DEMO_ALLOWLIST",
        },
        createdAt: Date.now(),
      });
      return {
        ok: false,
        blockedReason: `DEMO_MODE is on: ${supplier.email} is not on the allowlist. Refusing to send.`,
      };
    }
  }

  const thread = await ctx.db
    .query("threads")
    .withIndex("by_supplier", (q) => q.eq("supplierId", args.supplierId))
    .first();
  if (!thread) {
    throw new Error("No thread for this supplier yet");
  }

  const threadMessages = await ctx.db
    .query("messages")
    .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
    .take(200);
  const originalOutbound = threadMessages
    .filter((m) => m.direction === "out")
    .sort((a, b) => a.receivedAt - b.receivedAt)[0];

  let parentAgentmailMessageId: string | null = null;
  if (originalOutbound) {
    try {
      const status = await agentmail.status(
        ctx,
        originalOutbound.providerMessageId as Parameters<typeof agentmail.status>[1],
      );
      parentAgentmailMessageId = status?.agentmailMessageId ?? null;
    } catch {
      // Couldn't resolve yet (still pending, or a transient API error) -
      // fall through to the plain-send fallback below.
    }
  }

  const fallbackSubject = originalOutbound ? `Re: ${originalOutbound.subject}` : "Re: your quote request";
  const newOutboundId = parentAgentmailMessageId
    ? await agentmail.replyToMessage(ctx, project.inboxId, parentAgentmailMessageId, {
        text: args.body,
      })
    : await agentmail.sendMessage(ctx, project.inboxId, {
        to: supplier.email,
        subject: fallbackSubject,
        text: args.body,
      });

  await ctx.db.insert("messages", {
    threadId: thread._id,
    projectId: args.projectId,
    supplierId: args.supplierId,
    providerMessageId: newOutboundId,
    direction: "out",
    subject: fallbackSubject,
    bodyText: args.body,
    attachmentIds: [],
    receivedAt: Date.now(),
    processed: true,
  });
  await ctx.db.patch(thread._id, { lastMessageAt: Date.now() });

  return { ok: true };
}
