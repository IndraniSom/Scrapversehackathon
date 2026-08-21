/** Runtime review authorization tests. */
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

test("review list and decisions derive tenant and actor from auth", async () => {
  const backend = convexTest(schema, modules);
  const now = Date.now();
  const [taskA] = await backend.run(async (ctx) => {
    for (const org of ["org_a", "org_b"]) await ctx.db.insert("organizationProfiles", { organizationId: org, clerkOrganizationId: org, slug: org, displayName: org, timezone: "UTC", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: "org_a", clerkOrganizationId: "org_a", clerkUserId: "reviewer_a", role: "org:reviewer", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: "org_b", clerkOrganizationId: "org_b", clerkUserId: "viewer_b", role: "org:viewer", createdAt: now, updatedAt: now });
    const a = await ctx.db.insert("reviewTasks", { organizationId: "org_a", targetType: "requirement", targetId: "req_a", priority: "high", state: "open", createdAt: now });
    await ctx.db.insert("reviewTasks", { organizationId: "org_b", targetType: "requirement", targetId: "req_b", priority: "high", state: "open", createdAt: now });
    return [a];
  });
  const reviewer = backend.withIdentity({ subject: "reviewer_a", orgId: "org_a" });
  const viewer = backend.withIdentity({ subject: "viewer_b", orgId: "org_b" });
  expect(await reviewer.query(api.reviews.listReviewTasks, {})).toHaveLength(1);
  await reviewer.mutation(api.reviews.confirmReviewTask, { taskId: taskA, expectedRevision: now });
  await expect(viewer.mutation(api.reviews.confirmReviewTask, { taskId: taskA, expectedRevision: now })).rejects.toThrow();
});
