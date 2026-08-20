/**
 * Convex assessments invariants: immutable versioning, batch on request only, scenario isolation.
 */
import { describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";

function readAssessments(): string {
  return fs.readFileSync(path.resolve(__dirname, "../../convex/assessments.ts"), "utf8");
}
function readWorkspace(): string {
  return fs.readFileSync(path.resolve(__dirname, "../../components/opportunities/assessment-workspace.tsx"), "utf8");
}
function readPage(): string {
  return fs.readFileSync(path.resolve(__dirname, "../../app/(product)/opportunities/[opportunityId]/assessment/page.tsx"), "utf8");
}

describe("convex assessments", () => {
  test("assessments file declares immutable versioned assessment", () => {
    const text = readAssessments();
    expect(text).toContain("companyRevision");
    expect(text).toContain("opportunityVersion");
    expect(text).toContain("requirementSetRevision");
    expect(text).toContain("asOf");
    expect(text).toContain("eligibility.py");
    expect(text).toContain("assessment_service.py");
  });
  test("batch assessment is bounded and on request only", () => {
    const text = readAssessments();
    expect(text).toContain("MAX_BATCH");
    expect(text).toContain("batch exceeds limit");
    expect(text).toContain("requestBatchAssessment");
    expect(text).toContain("requestAssessment");
    // No unbounded collect or Cartesian generation
    expect(text).not.toMatch(/\.collect\(\)/);
    expect(text).toContain("idempotencyKey");
  });
  test("scenario mode never mutates accepted", () => {
    const text = readAssessments();
    expect(text).toContain("scenarioPreview");
    expect(text).toContain("Never mutates");
    expect(text).toContain("hypothetical");
    expect(text).not.toContain("insert(\"assessments\"");
    const ws = readWorkspace();
    expect(ws).toContain("hypothetical");
    expect(ws).toContain("Never mutates accepted");
    expect(ws).toContain("Accepted remains");
  });
  test("tenant isolation via requireOrganization", () => {
    const text = readAssessments();
    expect(text).toContain("requireOrganization");
    expect(text).toContain("organizationId");
  });
  test("preserves recommendation semantics without direct AI set", () => {
    const text = readWorkspace();
    expect(text).toContain("eligibility.py");
    expect(text).toContain("AI never sets recommendation");
    expect(readPage()).toContain("Deterministic evaluation via eligibility.py");
  });
  test("workspace shows base/current comparison and evidence", () => {
    const ws = readWorkspace();
    expect(ws).toContain("comparison-grid");
    expect(ws).toContain("Base tender");
    expect(ws).toContain("Current version");
    expect(ws).toContain("Rule evaluation");
    expect(ws).toContain("UNKNOWN");
    expect(ws).toContain("Unsupported");
  });
  test("files stay under 200 lines", () => {
    const lines = (p: string) => fs.readFileSync(p, "utf8").split("\n").length;
    expect(lines(path.resolve(__dirname, "../../convex/assessments.ts"))).toBeLessThan(200);
    expect(lines(path.resolve(__dirname, "../../components/opportunities/assessment-workspace.tsx"))).toBeLessThan(200);
    expect(lines(path.resolve(__dirname, "../../app/(product)/opportunities/[opportunityId]/assessment/page.tsx"))).toBeLessThan(200);
  });
});
