import { AgentMail } from "@agentmail/convex";
import { httpRouter } from "convex/server";
import { components, internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";

const agentmail = new AgentMail(components.agentmail, {
  onMessageReceived: internal.inbound.onMessageReceived,
});

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
  path: "/agentmail/webhook",
  method: "POST",
  // @agentmail/convex's RunMutationCtx type is pinned against an older
  // Convex version whose ActionCtx.runMutation had a narrower signature; the
  // extra `options` param on the current one trips a structural type check
  // even though the call is exactly what the package's own README shows.
  handler: httpAction(async (ctx, req) =>
    agentmail.handleWebhook(ctx as unknown as Parameters<typeof agentmail.handleWebhook>[0], req),
  ),
});

export default http;
