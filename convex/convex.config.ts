import { defineApp } from "convex/server";
import { v } from "convex/values";
import actionRetrier from "@convex-dev/action-retrier/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import agentmail from "@agentmail/convex/convex.config";
import firecrawl from "@firecrawl/firecrawl-convex/convex.config";
import staticHosting from "@convex-dev/static-hosting/convex.config";

const app = defineApp({
  env: {
    FIRECRAWL_API_KEY: v.string(),
    AGENTMAIL_API_KEY: v.string(),
  },
});

app.use(firecrawl, {
  env: {
    FIRECRAWL_API_KEY: app.env.FIRECRAWL_API_KEY,
  },
});
app.use(rateLimiter);
app.use(actionRetrier);
app.use(agentmail, {
  env: {
    AGENTMAIL_API_KEY: app.env.AGENTMAIL_API_KEY,
  },
});

// Keep BidWire's existing HTTP endpoints (auth + AgentMail webhook) at their
// current URLs. Static hosting is registered through convex/http.ts so the
// existing webhook URL does not need to change.
app.use(staticHosting);

export default app;
