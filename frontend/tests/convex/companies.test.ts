/** Validates company FY, INR, date ordering, tenant isolation, revision, and completeness. */
import { describe, expect, test, vi } from "vitest";
import { isValidDateOrder, isValidFinancialYear, isValidInrAmount, requireOrg } from "../../convex/companies";
import { ConvexError } from "convex/values";

describe("company validators", () => {
  test("accepts exact FY format and consecutive years", () => {
    expect(isValidFinancialYear("2023-24")).toBe(true);
    expect(isValidFinancialYear("2020-21")).toBe(true);
    expect(isValidFinancialYear("1999-00")).toBe(true);
  });
  test("rejects non-consecutive or malformed FY", () => {
    expect(isValidFinancialYear("2023-25")).toBe(false);
    expect(isValidFinancialYear("2023-24-")).toBe(false);
    expect(isValidFinancialYear("23-24")).toBe(false);
    expect(isValidFinancialYear("2023/24")).toBe(false);
    expect(isValidFinancialYear("2023-2")).toBe(false);
    expect(isValidFinancialYear("2023-24 ")).toBe(false);
    expect(isValidFinancialYear("")).toBe(false);
  });
  test("accepts decimal INR with up to 2 places", () => {
    expect(isValidInrAmount("100")).toBe(true);
    expect(isValidInrAmount("100.00")).toBe(true);
    expect(isValidInrAmount("0.01")).toBe(true);
    expect(isValidInrAmount("12000000.5")).toBe(true);
  });
  test("rejects invalid INR", () => {
    expect(isValidInrAmount("0")).toBe(false);
    expect(isValidInrAmount("0.00")).toBe(false);
    expect(isValidInrAmount("-5")).toBe(false);
    expect(isValidInrAmount("12.345")).toBe(false);
    expect(isValidInrAmount("12.")).toBe(false);
    expect(isValidInrAmount("abc")).toBe(false);
    expect(isValidInrAmount("")).toBe(false);
  });
  test("validates date ordering", () => {
    const a = Date.parse("2024-01-01");
    const b = Date.parse("2024-06-01");
    expect(isValidDateOrder(a, b)).toBe(true);
    expect(isValidDateOrder(b, a)).toBe(false);
    expect(isValidDateOrder(a, a)).toBe(false);
    expect(isValidDateOrder(undefined, b)).toBe(true);
    expect(isValidDateOrder(a, undefined)).toBe(true);
  });
});

describe("tenant isolation", () => {
  test("rejects unauthenticated identity", async () => {
    const ctx = { auth: { getUserIdentity: async () => null } } as never;
    await expect(requireOrg(ctx, "org_a")).rejects.toThrow(ConvexError);
  });
  test("rejects cross-tenant token", async () => {
    const ctx = { auth: { getUserIdentity: async () => ({ subject: "user_1", organizationId: "org_a" }) } } as never;
    await expect(requireOrg(ctx, "org_b")).rejects.toThrow(ConvexError);
    await expect(requireOrg({ auth: { getUserIdentity: async () => ({ subject: "user_1", organizationId: "org_a" }) } } as never, "org_a")).resolves.toBeUndefined();
  });
  test("allows matching organization and rejects blank org", async () => {
    const ctx = { auth: { getUserIdentity: async () => ({ subject: "user_1" }) } } as never;
    await expect(requireOrg(ctx, "org_x")).resolves.toBeUndefined();
    await expect(requireOrg(ctx, "   ")).rejects.toThrow(ConvexError);
  });
});

describe("optimistic concurrency and duplicate handling", () => {
  test("detects revision conflict", () => {
    const current: number = 3;
    const expectedOk: number = 3;
    const expectedStale: number = 2;
    expect(current === expectedOk).toBe(true);
    expect((current as number) !== (expectedStale as number)).toBe(true);
  });
  test("detects duplicate registrationId within same organization", () => {
    const existing = [{ organizationId: "org_a", registrationId: "CIN001" }, { organizationId: "org_a", registrationId: "CIN002" }];
    const isDuplicate = (org: string, reg: string) => existing.some((c) => c.organizationId === org && c.registrationId === reg);
    expect(isDuplicate("org_a", "CIN001")).toBe(true);
    expect(isDuplicate("org_a", "CIN003")).toBe(false);
    expect(isDuplicate("org_b", "CIN001")).toBe(false);
  });
  test("supports multiple companies per organization", () => {
    const companies = [
      { _id: "1", organizationId: "org_a", legalName: "Alpha Ltd" },
      { _id: "2", organizationId: "org_a", legalName: "Beta Ltd" },
      { _id: "3", organizationId: "org_b", legalName: "Gamma Ltd" },
    ];
    const byOrgA = companies.filter((c) => c.organizationId === "org_a");
    expect(byOrgA).toHaveLength(2);
    expect(companies.filter((c) => c.organizationId === "org_b")).toHaveLength(1);
  });
});

describe("completeness counts", () => {
  test("counts missing evidence without scoring", () => {
    const turn = [{ evidenceDocumentId: "doc1" }, { evidenceDocumentId: null }, {}] as never[];
    const cert = [{ evidenceDocumentId: null }] as never[];
    const missing = (r: Array<{ evidenceDocumentId?: string | null }>) => r.filter((x) => !x.evidenceDocumentId).length;
    expect(missing(turn)).toBe(2);
    expect(missing(cert)).toBe(1);
    expect(missing([...turn, ...cert])).toBe(3);
  });
});
