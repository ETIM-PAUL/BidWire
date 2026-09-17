import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function signedInAs(t: ReturnType<typeof convexTest>, email: string) {
  const userId = await t.run(async (ctx) => {
    return ctx.db.insert("users", { email });
  });
  return t.withIdentity({ subject: `${userId}|test-session`, issuer: "test" });
}

describe("line item ownership", () => {
  test("owner can manage their line items; a different user cannot", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await signedInAs(t, "li-owner@example.com");
    const asOther = await signedInAs(t, "li-other@example.com");

    const projectId = await asOwner.mutation(api.projects.createProject, {
      name: "Kitchen refresh",
      jobDescription: "New countertops",
      location: "Denver, CO",
      currency: "USD",
    });

    const lineItemId = await asOwner.mutation(api.lineItems.createLineItem, {
      projectId,
    });

    // --- positive: owner can update, list, and move their own item ---
    await asOwner.mutation(api.lineItems.updateLineItem, {
      lineItemId,
      name: "Countertop",
      quantity: 12,
    });
    const items = await asOwner.query(api.lineItems.listLineItems, { projectId });
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Countertop");

    // --- negative: a different user cannot read, update, delete, or move it ---
    await expect(
      asOther.query(api.lineItems.listLineItems, { projectId }),
    ).rejects.toThrow();
    await expect(
      asOther.mutation(api.lineItems.updateLineItem, { lineItemId, name: "hijacked" }),
    ).rejects.toThrow();
    await expect(
      asOther.mutation(api.lineItems.deleteLineItem, { lineItemId }),
    ).rejects.toThrow();
    await expect(
      asOther.mutation(api.lineItems.moveLineItem, {
        lineItemId,
        direction: "up",
      }),
    ).rejects.toThrow();
    await expect(
      asOther.mutation(api.lineItems.createLineItem, { projectId }),
    ).rejects.toThrow();

    // the item must be untouched by the refused calls
    const itemsAfter = await asOwner.query(api.lineItems.listLineItems, { projectId });
    expect(itemsAfter[0].name).toBe("Countertop");
  });
});

describe("project attachment access (regression: was an IDOR)", () => {
  test("a different user cannot resolve another project's attachments", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await signedInAs(t, "file-owner@example.com");
    const asOther = await signedInAs(t, "file-other@example.com");

    // Seed a stored file and attach it to the owner's project directly
    // (bypassing the real upload flow, which needs a live HTTP endpoint).
    const storageId = await t.run(async (ctx) => {
      return ctx.storage.store(new Blob(["fake image bytes"]));
    });
    const projectId = await asOwner.mutation(api.projects.createProject, {
      name: "Bathroom remodel",
      jobDescription: "Gut and redo",
      location: "Austin, TX",
      currency: "USD",
      attachmentIds: [storageId],
    });

    // positive: owner can resolve their own attachment
    const ownerAttachments = await asOwner.query(api.files.getProjectAttachments, {
      projectId,
    });
    expect(ownerAttachments).toHaveLength(1);
    expect(ownerAttachments[0].storageId).toBe(storageId);
    expect(ownerAttachments[0].url).not.toBeNull();

    // negative: a different user requesting the SAME project is refused
    // entirely (can't even discover the storage ID exists)
    await expect(
      asOther.query(api.files.getProjectAttachments, { projectId }),
    ).rejects.toThrow();
  });
});
