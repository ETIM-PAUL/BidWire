import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireProjectOwner, requireUserId } from "./lib/auth";

// Any signed-in user can request an upload URL; the file only becomes
// reachable once its storage ID is attached to a project the uploader owns,
// via createProject's attachmentIds — see getProjectAttachments below.
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUserId(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

// Storage IDs are resolved for the CALLER'S OWN project only, read server-side
// from the project record — never from a client-supplied storage ID list, so
// a caller can't probe or resolve another project's attachments (IDOR).
export const getProjectAttachments = query({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({ storageId: v.id("_storage"), url: v.union(v.string(), v.null()) }),
  ),
  handler: async (ctx, args) => {
    const project = await requireProjectOwner(ctx, args.projectId);
    const storageIds = project.attachmentIds ?? [];
    return Promise.all(
      storageIds.map(async (storageId) => ({
        storageId,
        url: await ctx.storage.getUrl(storageId),
      })),
    );
  },
});
