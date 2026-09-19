/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as boq from "../boq.js";
import type * as discovery from "../discovery.js";
import type * as drafts from "../drafts.js";
import type * as events from "../events.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as inbound from "../inbound.js";
import type * as inbox from "../inbox.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_llm from "../lib/llm.js";
import type * as lineItems from "../lineItems.js";
import type * as projects from "../projects.js";
import type * as quoteExtraction from "../quoteExtraction.js";
import type * as quotes from "../quotes.js";
import type * as rfq from "../rfq.js";
import type * as suppliers from "../suppliers.js";
import type * as threads from "../threads.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  boq: typeof boq;
  discovery: typeof discovery;
  drafts: typeof drafts;
  events: typeof events;
  files: typeof files;
  http: typeof http;
  inbound: typeof inbound;
  inbox: typeof inbox;
  "lib/auth": typeof lib_auth;
  "lib/llm": typeof lib_llm;
  lineItems: typeof lineItems;
  projects: typeof projects;
  quoteExtraction: typeof quoteExtraction;
  quotes: typeof quotes;
  rfq: typeof rfq;
  suppliers: typeof suppliers;
  threads: typeof threads;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  firecrawl: import("@firecrawl/firecrawl-convex/_generated/component.js").ComponentApi<"firecrawl">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  actionRetrier: import("@convex-dev/action-retrier/_generated/component.js").ComponentApi<"actionRetrier">;
  agentmail: import("@agentmail/convex/_generated/component.js").ComponentApi<"agentmail">;
};
