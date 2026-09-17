import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function requireUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }
  return userId;
}

export async function requireProjectOwner(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
) {
  const userId = await requireUserId(ctx);
  const project = await ctx.db.get(projectId);
  if (!project || project.ownerId !== userId) {
    throw new Error("Project not found");
  }
  return project;
}

export async function requireLineItemOwner(
  ctx: QueryCtx | MutationCtx,
  lineItemId: Id<"lineItems">,
) {
  const lineItem = await ctx.db.get(lineItemId);
  if (!lineItem) {
    throw new Error("Line item not found");
  }
  await requireProjectOwner(ctx, lineItem.projectId);
  return lineItem;
}
