/** Runtime tenant-boundary tests for opportunities and tender documents. */
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

/** Seeds two tenants and one opportunity per tenant. */
async function resourceBackend() {
  const backend = convexTest(schema, modules);
  const ids = await backend.run(async (ctx) => {
    const now = Date.now();
    for (const organizationId of ["org_a", "org_b"]) {
      await ctx.db.insert("organizationProfiles", { organizationId, clerkOrganizationId: organizationId, slug: organizationId, displayName: organizationId, timezone: "UTC", createdAt: now, updatedAt: now });
    }
    await ctx.db.insert("organizationMemberships", { organizationId: "org_a", clerkOrganizationId: "org_a", clerkUserId: "user_a", role: "org:admin", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: "org_b", clerkOrganizationId: "org_b", clerkUserId: "user_b", role: "org:admin", createdAt: now, updatedAt: now });
    const opportunityA = await ctx.db.insert("opportunities", { organizationId: "org_a", source: "NTPC", sourceTenderId: "A", title: "Tender A", authority: "NTPC", lifecycle: "open", createdAt: now, updatedAt: now });
    const opportunityB = await ctx.db.insert("opportunities", { organizationId: "org_b", source: "NTPC", sourceTenderId: "B", title: "Tender B", authority: "NTPC", lifecycle: "open", createdAt: now, updatedAt: now });
    return { opportunityA, opportunityB };
  });
  return { backend, ids };
}

test("opportunity and document APIs derive tenant from verified identity", async () => {
  const { backend, ids } = await resourceBackend();
  const tenantA = backend.withIdentity({ subject: "user_a", orgId: "org_a" });
  expect((await tenantA.query(api.opportunities.listOpportunities, {})).map((item) => item.title)).toEqual(["Tender A"]);
  await expect(tenantA.query(api.opportunities.getOpportunity, { opportunityId: ids.opportunityB })).rejects.toThrow("Opportunity not found");
  await expect(tenantA.mutation(api.documents.queueOfficialDocument, { opportunityId: ids.opportunityB, url: "https://ntpctender.ntpc.co.in/B", role: "BASE_TENDER" })).rejects.toThrow("Opportunity not found");
  const queued = await tenantA.mutation(api.documents.queueOfficialDocument, { opportunityId: ids.opportunityA, url: "https://ntpctender.ntpc.co.in/A", role: "BASE_TENDER" });
  expect((await tenantA.query(api.documents.getDocument, { documentId: queued.documentId })).organizationId).toBe("org_a");
});

test("opportunity and document APIs reject unauthenticated calls", async () => {
  const { backend, ids } = await resourceBackend();
  await expect(backend.query(api.opportunities.listOpportunities, {})).rejects.toThrow();
  await expect(backend.query(api.documents.listDocuments, { opportunityId: ids.opportunityA })).rejects.toThrow();
});
