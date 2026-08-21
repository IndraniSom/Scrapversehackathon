/** Isolated browser-test seed; unavailable outside BIDRADAR_E2E_MODE=1. */
import { mutation } from "./_generated/server";
import { throwForbidden } from "./lib/errors";

/** Seeds minimal persistent records used only by browser acceptance tests. */
export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.BIDRADAR_E2E_MODE !== "1") throwForbidden("E2E seed is disabled.");
    const existing = await ctx.db.query("organizationProfiles").withIndex("by_clerkOrganizationId", (index) => index.eq("clerkOrganizationId", "org_e2e")).unique();
    if (existing !== null) return { organizationId: "org_e2e", seeded: false };
    const now = Date.now();
    await ctx.db.insert("organizationProfiles", { organizationId: "org_e2e", clerkOrganizationId: "org_e2e", slug: "e2e", displayName: "E2E organization", timezone: "Asia/Kolkata", createdAt: now, updatedAt: now });
    const companyId = await ctx.db.insert("companies", { organizationId: "org_e2e", legalName: "Test Systems Private Limited", registrationId: "CIN-E2E", status: "active", revision: 1, createdAt: now, updatedAt: now });
    const opportunityId = await ctx.db.insert("opportunities", { organizationId: "org_e2e", source: "NTPC", sourceTenderId: "E2E-NIT-1", title: "Cloud security operations", authority: "NTPC", category: "CYBERSECURITY", location: "ODISHA", lifecycle: "open", dataMode: "MANUAL_FIXTURE", createdAt: now, updatedAt: now });
    await ctx.db.insert("reviewTasks", { organizationId: "org_e2e", targetType: "requirement", targetId: "turnover-average", priority: "high", state: "open", createdAt: now, updatedAt: now });
    await ctx.db.insert("contentEntries", { organizationId: "org_e2e", title: "ISO 27001 controls", body: "Approved hosting control evidence.", capabilityArea: "cybersecurity", ownerId: "e2e-user", status: "approved", freshnessState: "fresh", createdAt: now, updatedAt: now });
    const proposalId = await ctx.db.insert("proposalProjects", { organizationId: "org_e2e", opportunityId, companyId, stage: "draft", ownerId: "e2e-user", createdAt: now, updatedAt: now });
    const exportId = await ctx.db.insert("exportJobs", { organizationId: "org_e2e", format: "zip", sourceRevision: 1, outputDigest: "a".repeat(64), createdAt: now });
    await ctx.db.insert("submissionPackages", { organizationId: "org_e2e", proposalId, exportIds: [exportId], manifest: "a".repeat(64), validationState: "valid", approvalState: "approved", createdAt: now });
    return { organizationId: "org_e2e", seeded: true };
  },
});
