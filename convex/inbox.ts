import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action } from "./_generated/server";

type InboxResponse = { inbox_id: string; email: string };

// Workaround: @agentmail/convex 0.1.0's createInbox (and the other inbox-
// management calls) are internal-visibility functions that fail to resolve
// cross-component on this Convex version ("Couldn't resolve
// agentmail.lib.createInbox") - confirmed by direct probing: the component's
// PUBLIC functions (enqueueSend, listCachedInboxes) resolve and work fine,
// only its internal ones don't. sendMessage (used by drafts.ts's sendRfq)
// goes through enqueueSend, so it's unaffected - this workaround is scoped
// to inbox creation only. Calls AgentMail's REST API directly, matching
// exactly what the component's own createInbox does internally (same
// endpoint, auth header, and request/response shape - see
// node_modules/@agentmail/convex/src/component/utils.ts's agentmailFetch).
async function createInboxDirect(request: {
  username?: string;
  display_name?: string;
}): Promise<InboxResponse> {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  if (!apiKey) {
    throw new Error(
      "AGENTMAIL_API_KEY is not set on this Convex deployment. Run " +
        "`npx convex env set AGENTMAIL_API_KEY <key>`.",
    );
  }
  const baseUrl = process.env.AGENTMAIL_BASE_URL ?? "https://api.agentmail.to/v0";
  const response = await fetch(`${baseUrl}/inboxes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AgentMail API error ${response.status}: ${text.slice(0, 500)}`);
  }
  return response.json();
}

// Public action: ownership is enforced by routing through the existing
// ownership-checked projects.getProject query before calling AgentMail.
// Idempotent: a project that already has an inbox is left alone.
export const provisionInbox = action({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(api.projects.getProject, {
      projectId: args.projectId,
    });
    if (project.inboxId) {
      return null;
    }

    const shortId = args.projectId.slice(-8);
    const inbox = await createInboxDirect({
      username: `bidwire-${shortId}`,
      display_name: project.name,
    });

    await ctx.runMutation(internal.projects.setInbox, {
      projectId: args.projectId,
      inboxId: inbox.inbox_id,
      inboxAddress: inbox.email,
    });
    return null;
  },
});
