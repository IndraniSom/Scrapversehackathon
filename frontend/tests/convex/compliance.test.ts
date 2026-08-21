/**
 * Compliance matrix: deterministic seeding, gaps, tenant isolation and CSV export.
 */
import { describe, expect, test } from "vitest";
import { buildComplianceRows, classifyGap, detectConflictingRequirements, detectDuplicateClauses, exportComplianceCsv, isApprovalBlocked, isStaleRequirement, proposeAiGrouping, validateTenant, type ComplianceRow } from "../../convex/compliance";

/** Helper to build a requirement for deterministic matrix tests. */
function req(id = "req-001", citation = "Section 5.1 Turnover", org = "org-1", revision = 2, mandatory = true, evaluation?: "PASS" | "FAIL" | "UNKNOWN") {
  return { id, citation, organizationId: org, revision, isMandatory: mandatory, evaluation };
}

describe("compliance matrix", () => {
  test("complete matrix is deterministic before AI grouping", () => {
    const rows = buildComplianceRows([req("req-002", "Section 5.2"), req("req-001", "Section 5.1")], "org-1");
    expect(rows.map((r) => r.requirementId)).toEqual(["req-001", "req-002"]);
    const grouped = proposeAiGrouping(rows);
    expect(rows.map((r) => r.requirementId)).toEqual(["req-001", "req-002"]);
    expect(Object.keys(grouped).length).toBeGreaterThan(0);
  });

  test("missing response is MISSING_DATA and blocks approval", () => {
    const rows = buildComplianceRows([req()], "org-1");
    expect(classifyGap(rows[0])).toBe("MISSING_DATA");
    expect(isApprovalBlocked(rows)).toBe(true);
    const withResponse: ComplianceRow = { ...rows[0], responseLocation: "Proposal §1" };
    expect(classifyGap(withResponse)).toBe("MISSING_DOCUMENT");
  });

  test("missing evidence and owner categories use correct precedence", () => {
    const base = buildComplianceRows([req()], "org-1")[0];
    expect(classifyGap({ ...base, responseLocation: "§1" })).toBe("MISSING_DOCUMENT");
    expect(classifyGap({ ...base, responseLocation: "§1", evidence: "cert.pdf" } as ComplianceRow)).toBe("OWNER_REQUIRED");
  });

  test("failed and unknown semantics map to gap categories", () => {
    expect(buildComplianceRows([req("req-001", "Section 5.1", "org-1", 2, true, "FAIL")], "org-1")[0].gapCategory).toBe("FAILED_REQUIREMENT");
    expect(buildComplianceRows([req("req-001", "Section 5.1", "org-1", 2, true, "UNKNOWN")], "org-1")[0].gapCategory).toBe("UNKNOWN_SEMANTICS");
    expect(buildComplianceRows([req("req-001", "Section 5.1", "org-1", 1)], "org-1", 2)[0].gapCategory).toBe("REVIEW_REQUIRED");
    expect(isStaleRequirement(1, 2)).toBe(true);
    expect(isStaleRequirement(2, 2)).toBe(false);
  });

  test("conflicting and duplicate clause detection", () => {
    const dup = [req("req-001", "Section 5.1"), req("req-002", "Section 5.1")];
    expect(detectDuplicateClauses(dup)).toEqual(["Section 5.1"]);
    expect(detectConflictingRequirements(dup)).toEqual([["req-001", "req-002"]]);
    const single = [req("req-001", "Section 5.1"), req("req-002", "Section 5.2")];
    expect(detectDuplicateClauses(single)).toEqual([]);
    expect(detectConflictingRequirements(single)).toEqual([]);
  });

  test("cross-tenant requirement is rejected", () => {
    expect(() => buildComplianceRows([req("req-001", "Section 5.1", "org-2")], "org-1")).toThrow(/cross-tenant/);
    expect(() => buildComplianceRows([req("req-001"), req("req-001")], "org-1")).toThrow(/duplicate/);
    expect(() => validateTenant("org-1", "org-2")).toThrow();
  });

  test("approval blocked only for mandatory rows", () => {
    const mandatory: ComplianceRow = { requirementId: "req-001", citation: "Section 5.1", responseLocation: "§1", evidence: "doc.pdf", ownerId: "owner-1", status: "compliant", isMandatory: true, requirementRevision: 2, organizationId: "org-1" };
    expect(isApprovalBlocked([mandatory])).toBe(false);
    const optional: ComplianceRow = { requirementId: "req-002", citation: "Section 6.1", status: "gap", gapCategory: "MISSING_DATA", isMandatory: false, requirementRevision: 2, organizationId: "org-1" };
    expect(isApprovalBlocked([optional])).toBe(false);
    expect(isApprovalBlocked([{ ...mandatory, evidence: undefined } as ComplianceRow])).toBe(true);
  });

  test("CSV export is deterministic and escaped", () => {
    const rows: ComplianceRow[] = [
      { requirementId: "req-002", citation: 'Section "A", clause', responseLocation: "§2, annex", evidence: "doc.pdf", ownerId: "owner-2", status: "compliant", isMandatory: true, requirementRevision: 2, organizationId: "org-1" },
      { requirementId: "req-001", citation: "Section 5.1", responseLocation: "§1", evidence: "a.pdf", ownerId: "owner-1", status: "gap", gapCategory: "MISSING_DOCUMENT", isMandatory: true, requirementRevision: 2, organizationId: "org-1" },
    ];
    const csv = exportComplianceCsv(rows);
    expect(csv.startsWith("requirement_id,citation,response_location")).toBe(true);
    expect(csv.indexOf("req-001")).toBeLessThan(csv.indexOf("req-002"));
    expect(csv).toContain('""A""');
    expect(csv.endsWith("\n")).toBe(true);
  });

  test("stale amendment marks REVIEW_REQUIRED and blocks", () => {
    const rows = buildComplianceRows([req("req-001", "Section 5.1", "org-1", 1)], "org-1", 3);
    expect(rows[0].gapCategory).toBe("REVIEW_REQUIRED");
    const compliantStale: ComplianceRow = { ...rows[0], responseLocation: "§1", evidence: "doc.pdf", ownerId: "owner-1", status: "compliant" };
    expect(classifyGap(compliantStale)).toBe("REVIEW_REQUIRED");
  });
});
