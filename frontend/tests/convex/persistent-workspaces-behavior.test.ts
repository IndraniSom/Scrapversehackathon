/** Runtime persistence tests for proposal, content, and outcome workspaces. */
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

test("proposal, content, and outcomes persist for authenticated tenant", async () => {
  const backend = convexTest(schema, modules);
  const now = Date.now();
  const ids = await backend.run(async (ctx) => {
    await ctx.db.insert("organizationProfiles", { organizationId: "org_a", clerkOrganizationId: "org_a", slug: "org-a", displayName: "Org A", timezone: "UTC", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: "org_a", clerkOrganizationId: "org_a", clerkUserId: "manager_a", role: "org:bid_manager", createdAt: now, updatedAt: now });
    const companyId = await ctx.db.insert("companies", { organizationId: "org_a", legalName: "Bidder A", registrationId: "CIN-A", status: "active", revision: 1, createdAt: now, updatedAt: now });
    const opportunityId = await ctx.db.insert("opportunities", { organizationId: "org_a", source: "NTPC", sourceTenderId: "NIT-A", title: "Cloud", authority: "NTPC", lifecycle: "open", createdAt: now, updatedAt: now });
    return { companyId, opportunityId };
  });
  const caller = backend.withIdentity({ subject: "manager_a", orgId: "org_a" });
  const proposal = await caller.mutation(api.proposals.createProposal, ids);
  await caller.mutation(api.proposals.generateOutline, { proposalId: proposal.id, clauses: [{ title: "1 Technical approach", citation: "Tender p3" }] });
  expect((await caller.query(api.proposals.getProposal, { proposalId: proposal.id })).sections).toHaveLength(1);
  const entryId = await caller.mutation(api.contentLibrary.createEntry, { title: "Hosting controls", body: "Approved evidence text" });
  expect((await caller.query(api.contentLibrary.getEntry, { entryId })).body).toBe("Approved evidence text");
  await caller.mutation(api.analytics.recordOutcome, { opportunityId: ids.opportunityId, result: "lost", reasonCategories: ["price"] });
  expect(await caller.query(api.analytics.listOutcomes, {})).toHaveLength(1);
});
