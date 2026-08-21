/** Runtime company tenant-boundary regression tests. */
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

/** Builds two authenticated tenants with one company each. */
async function companyBackend() {
  const backend = convexTest(schema, modules);
  const companyIds = await backend.run(async (ctx) => {
    const now = Date.now();
    for (const organizationId of ["org_a", "org_b"]) {
      await ctx.db.insert("organizationProfiles", { organizationId, clerkOrganizationId: organizationId, slug: organizationId, displayName: organizationId, timezone: "UTC", createdAt: now, updatedAt: now });
    }
    await ctx.db.insert("organizationMemberships", { organizationId: "org_a", clerkOrganizationId: "org_a", clerkUserId: "user_a", role: "org:admin", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: "org_b", clerkOrganizationId: "org_b", clerkUserId: "user_b", role: "org:admin", createdAt: now, updatedAt: now });
    const companyA = await ctx.db.insert("companies", { organizationId: "org_a", legalName: "Company A", status: "active", revision: 1, createdAt: now, updatedAt: now });
    const companyB = await ctx.db.insert("companies", { organizationId: "org_b", legalName: "Company B", status: "active", revision: 1, createdAt: now, updatedAt: now });
    return { companyA, companyB };
  });
  return { backend, companyIds };
}

test("company APIs derive tenant from identity and hide cross-tenant records", async () => {
  const { backend, companyIds } = await companyBackend();
  const tenantA = backend.withIdentity({ subject: "user_a", orgId: "org_a" });
  expect((await tenantA.query(api.companies.listCompanies, {})).map((company) => company.legalName)).toEqual(["Company A"]);
  await expect(tenantA.query(api.companies.getCompany, { companyId: companyIds.companyB })).rejects.toThrow("Company not found");
  const created = await tenantA.mutation(api.companies.createCompany, { legalName: "Company A2" });
  expect((await tenantA.query(api.companies.getCompany, { companyId: created })).company.organizationId).toBe("org_a");
});

test("company APIs reject unauthenticated requests", async () => {
  const { backend } = await companyBackend();
  await expect(backend.query(api.companies.listCompanies, {})).rejects.toThrow();
});
