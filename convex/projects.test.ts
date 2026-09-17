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

describe("project ownership (Phase 2 acceptance criteria)", () => {
  test("owner can read their project; a different user cannot", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await signedInAs(t, "owner@example.com");
    const asOther = await signedInAs(t, "other@example.com");

    const projectId = await asOwner.mutation(api.projects.createProject, {
      name: "Bathroom remodel",
      jobDescription: "Gut and redo a 2-bed bathroom",
      location: "Austin, TX",
      currency: "USD",
    });

    // --- positive: the owner sees their own project everywhere ---
    const ownerProjects = await asOwner.query(api.projects.listMyProjects, {});
    expect(ownerProjects.map((p) => p._id)).toContain(projectId);

    const project = await asOwner.query(api.projects.getProject, { projectId });
    expect(project.name).toBe("Bathroom remodel");

    const events = await asOwner.query(api.events.listEvents, { projectId });
    expect(events.some((e) => e.type === "project_created")).toBe(true);

    // --- data-scope: a different user's list never includes it ---
    const otherProjects = await asOther.query(api.projects.listMyProjects, {});
    expect(otherProjects.map((p) => p._id)).not.toContain(projectId);

    // --- negative: a different user directly requesting it by ID is refused ---
    await expect(
      asOther.query(api.projects.getProject, { projectId }),
    ).rejects.toThrow();
    await expect(
      asOther.query(api.events.listEvents, { projectId }),
    ).rejects.toThrow();
  });

  test("unauthenticated callers are refused", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await signedInAs(t, "owner2@example.com");
    const projectId = await asOwner.mutation(api.projects.createProject, {
      name: "Kitchen refresh",
      jobDescription: "New countertops and backsplash",
      location: "Denver, CO",
      currency: "USD",
    });

    await expect(t.query(api.projects.listMyProjects, {})).rejects.toThrow();
    await expect(
      t.query(api.projects.getProject, { projectId }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.projects.createProject, {
        name: "x",
        jobDescription: "x",
        location: "x",
        currency: "USD",
      }),
    ).rejects.toThrow();
  });
});
