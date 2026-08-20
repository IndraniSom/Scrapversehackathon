import { describe, expect, test, vi } from "vitest";

import { getAssessment, getSourceProof } from "../lib/api";
import { arrayProperty, cloneFixture, jsonResponse, objectProperty, objectValue, readFixture, verifiedProofFixture } from "./fixtures";

vi.mock("next/dist/compiled/server-only", () => ({}));

const assessment = readFixture("assessment.manual.json");

/** Returns a complete JSON fetch boundary for schema-parity mutations. */
function respondingWith(body: unknown): typeof fetch {
  return vi.fn(async () => jsonResponse(body));
}

/** Builds assessment input whose only variable is the first rule's applicability. */
function assessmentWithApplicability(operator: string, expectedValue: unknown): unknown {
  const copy = cloneFixture(assessment);
  for (const version of ["base_assessment", "amended_assessment"]) {
    const assessmentVersion = objectProperty(objectProperty(copy, "data"), version);
    const requirements = objectProperty(assessmentVersion, "requirements");
    const children = arrayProperty(requirements, "children");
    for (const child of children) {
      const leaf = objectValue(child);
      if (leaf.kind === "CERTIFICATION") objectProperty(leaf, "predicate").valid_at = "2026-02-02T12:00:00+05:30";
    }
    const turnover = objectValue(children[0]);
    turnover.applicability = {
      field: "bidder_type",
      operator,
      expected_value: expectedValue,
      evidence: arrayProperty(turnover, "evidence")[0],
    };
  }
  return copy;
}

describe("final contract schema parity", () => {
  test("accepts nullable certification validity anchors", async () => {
    await expect(getAssessment("ocac-pond-monitoring-26001", { fetcher: respondingWith(assessment) })).resolves.toMatchObject({
      data: { base_assessment: { unknown_applicable_rule_count: 3 }, amended_assessment: { unknown_applicable_rule_count: 3 } },
    });
  });

  test.each([
    ["EQUALS", "STARTUP"],
    ["IN", ["STARTUP", "MSME"]],
    ["EXISTS", null],
  ])("accepts the %s applicability discriminator shape", async (operator, expectedValue) => {
    const body = assessmentWithApplicability(operator, expectedValue);
    await expect(getAssessment("ocac-pond-monitoring-26001", { fetcher: respondingWith(body) })).resolves.toBeDefined();
  });

  test.each([
    ["EQUALS", true],
    ["EQUALS", ["STARTUP"]],
    ["IN", "STARTUP"],
    ["IN", []],
    ["IN", ["STARTUP", "STARTUP"]],
    ["EXISTS", "present"],
  ])("rejects mismatched %s applicability value", async (operator, expectedValue) => {
    const body = assessmentWithApplicability(operator, expectedValue);
    await expect(getAssessment("ocac-pond-monitoring-26001", { fetcher: respondingWith(body) })).rejects.toMatchObject({ kind: "schema" });
  });

  test("accepts an internally consistent VERIFIED proof", async () => {
    await expect(getSourceProof({ fetcher: respondingWith(verifiedProofFixture()) })).resolves.toMatchObject({ data: { status: "VERIFIED" } });
  });

  test("rejects VERIFIED proof with a non-recorded normalized mode", async () => {
    const invalid = cloneFixture(verifiedProofFixture());
    objectProperty(objectProperty(invalid, "data"), "normalized_record").data_mode = "MANUAL_FIXTURE";
    await expect(getSourceProof({ fetcher: respondingWith(invalid) })).rejects.toMatchObject({ kind: "schema" });
  });

  test("rejects VERIFIED proof with an unlinked normalized snapshot", async () => {
    const invalid = cloneFixture(verifiedProofFixture());
    objectProperty(objectProperty(invalid, "data"), "normalized_record").snapshot_sha256 = "6666666666666666666666666666666666666666666666666666666666666666";
    await expect(getSourceProof({ fetcher: respondingWith(invalid) })).rejects.toMatchObject({ kind: "schema" });
  });
});
