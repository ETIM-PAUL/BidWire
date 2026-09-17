import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function signedInAs(t: ReturnType<typeof convexTest>, email: string) {
  const userId = await t.run(async (ctx) => {
    return ctx.db.insert("users", { email });
  });
  return t.withIdentity({ subject: `${userId}|test-session`, issuer: "test" });
}

const ORIGINAL_DEMO_MODE = process.env.DEMO_MODE;

afterEach(() => {
  if (ORIGINAL_DEMO_MODE === undefined) {
    delete process.env.DEMO_MODE;
  } else {
    process.env.DEMO_MODE = ORIGINAL_DEMO_MODE;
  }
});

describe("supplier selection under DEMO_MODE", () => {
  test("in DEMO_MODE, a real (firecrawl) supplier cannot be selected, but a demo supplier can", async () => {
    process.env.DEMO_MODE = "true";
    const t = convexTest(schema, modules);
    const asOwner = await signedInAs(t, "supplier-owner@example.com");

    const projectId = await asOwner.mutation(api.projects.createProject, {
      name: "Deck rebuild",
      jobDescription: "Rebuild the back deck",
      location: "Portland, OR",
      currency: "USD",
    });

    const realSupplierId = await t.run(async (ctx) => {
      return ctx.db.insert("suppliers", {
        projectId,
        name: "Real Lumber Co",
        website: "https://real-lumber.example",
        source: "firecrawl",
        categories: ["Carpentry"],
        status: "candidate",
      });
    });
    await asOwner.mutation(internal.suppliers.ensureDemoSuppliers, { projectId });
    const suppliers = await asOwner.query(api.suppliers.listSuppliers, { projectId });
    const demoSupplierId = suppliers.find((s) => s.source === "demo")!._id;

    // negative: selecting a real scraped supplier in DEMO_MODE is refused
    await expect(
      asOwner.mutation(api.suppliers.toggleSupplierSelected, {
        supplierId: realSupplierId,
      }),
    ).rejects.toThrow();

    // positive: selecting a demo supplier still works
    await asOwner.mutation(api.suppliers.toggleSupplierSelected, {
      supplierId: demoSupplierId,
    });
    const afterToggle = await asOwner.query(api.suppliers.listSuppliers, { projectId });
    expect(afterToggle.find((s) => s._id === demoSupplierId)?.status).toBe("selected");
    // the real supplier must be untouched by the refused attempt
    expect(afterToggle.find((s) => s._id === realSupplierId)?.status).toBe("candidate");
  });

  test("outside DEMO_MODE, a real supplier can be selected", async () => {
    delete process.env.DEMO_MODE;
    const t = convexTest(schema, modules);
    const asOwner = await signedInAs(t, "supplier-owner2@example.com");
    const projectId = await asOwner.mutation(api.projects.createProject, {
      name: "Fence install",
      jobDescription: "New backyard fence",
      location: "Portland, OR",
      currency: "USD",
    });
    const realSupplierId = await t.run(async (ctx) => {
      return ctx.db.insert("suppliers", {
        projectId,
        name: "Real Fence Co",
        source: "firecrawl",
        categories: ["Carpentry"],
        status: "candidate",
      });
    });

    await asOwner.mutation(api.suppliers.toggleSupplierSelected, {
      supplierId: realSupplierId,
    });
    const suppliers = await asOwner.query(api.suppliers.listSuppliers, { projectId });
    expect(suppliers.find((s) => s._id === realSupplierId)?.status).toBe("selected");
  });
});

describe("supplier ownership", () => {
  test("a different user cannot list or toggle another user's suppliers", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await signedInAs(t, "supplier-owner3@example.com");
    const asOther = await signedInAs(t, "supplier-other@example.com");

    const projectId = await asOwner.mutation(api.projects.createProject, {
      name: "Roof repair",
      jobDescription: "Patch the roof",
      location: "Seattle, WA",
      currency: "USD",
    });
    const supplierId = await t.run(async (ctx) => {
      return ctx.db.insert("suppliers", {
        projectId,
        name: "Roofers Inc",
        source: "manual",
        categories: ["Roofing"],
        status: "candidate",
      });
    });

    await expect(
      asOther.query(api.suppliers.listSuppliers, { projectId }),
    ).rejects.toThrow();
    await expect(
      asOther.mutation(api.suppliers.toggleSupplierSelected, { supplierId }),
    ).rejects.toThrow();
  });
});
