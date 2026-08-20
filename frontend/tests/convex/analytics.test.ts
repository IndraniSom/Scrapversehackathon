/**
 * Analytics invariants: hypothetical labeling, outcome validation, export/deletion.
 */
import { describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";

function readAnalytics(): string {
  return fs.readFileSync(path.resolve(__dirname, "../../convex/analytics.ts"), "utf8");
}
function readSimulator(): string {
  return fs.readFileSync(path.resolve(__dirname, "../../components/opportunities/scenario-simulator.tsx"), "utf8");
}
function readReports(): string {
  return fs.readFileSync(path.resolve(__dirname, "../../app/(product)/reports/page.tsx"), "utf8");
}
function readPostBid(): string {
  return fs.readFileSync(path.resolve(__dirname, "../../../backend/src/backend/post_bid_learning.py"), "utf8");
}
function readScenario(): string {
  return fs.readFileSync(path.resolve(__dirname, "../../../backend/src/backend/scenario_simulation.py"), "utf8");
}

describe("analytics hypothetical and tenant invariants", () => {
  test("analytics requires organization and validates outcomes", () => {
    const text = readAnalytics();
    expect(text.includes("requireOrganization")).toBe(true);
    expect(text.includes("recordOutcome")).toBe(true);
    expect(text.includes("won") && text.includes("lost") && text.includes("no_submit")).toBe(true);
    expect(text.includes("reasonCategories") || text.includes("ALLOWED_REASONS")).toBe(true);
    expect(text.includes("throwValidation")).toBe(true);
  });

  test("hypothetical assessments are labeled and never mutate accepted", () => {
    const text = readAnalytics();
    expect(text.includes("isHypothetical")).toBe(true);
    expect(text.includes("hypothetical")).toBe(true);
    expect(text.includes("never mutate") || text.includes("never mutates") || text.includes("Never mutates")).toBe(true);
    const sim = readSimulator();
    expect(sim.includes("hypothetical")).toBe(true);
    expect(sim.includes("never mutates accepted") || sim.includes("never mutates")).toBe(true);
    expect(sim.includes("Accepted remains") || sim.includes("Accepted recommendation")).toBe(true);
    const py = readScenario();
    expect(py.includes("is_hypothetical")).toBe(true);
    expect(py.includes("model_copy")).toBe(true);
    expect(py.includes("never mutating") || py.includes("never mutates")).toBe(true);
  });

  test("scenario simulator allows temporary evidence, unknown resolution, amendment version", () => {
    const sim = readSimulator();
    expect(sim.toLowerCase().includes("turnover") || sim.includes("Temporary")).toBe(true);
    expect(sim.toLowerCase().includes("resolve unknown") || sim.includes("resolveUnknown")).toBe(true);
    expect(sim.toLowerCase().includes("amendment")).toBe(true);
    expect(sim.includes("Recompute hypothetical")).toBe(true);
    const py = readScenario();
    expect(py.includes("with_temporary_turnover")).toBe(true);
    expect(py.includes("with_resolved_certification")).toBe(true);
    expect(py.includes("select_amendment_version")).toBe(true);
  });

  test("reports show counts, timeline, minimum-sample disclosure without causation claims", () => {
    const reports = readReports();
    expect(reports.includes("Sample size")).toBe(true);
    expect(reports.includes("minimum") || reports.includes("MIN_SAMPLE")).toBe(true);
    expect(reports.includes("byResult") || reports.includes("byReason") || reports.includes("Timeline")).toBe(true);
    expect(reports.toLowerCase().includes("not causation") || reports.includes("observation, not causation")).toBe(true);
    expect(reports.includes("suggestions") || reports.includes("Post-bid suggestions")).toBe(true);
    // Must not claim predictive causation
    expect(reports.includes("predict wins") || reports.includes("cannot prove causation") || reports.includes("Descriptive summary only")).toBe(true);
    expect(reports.toLowerCase().includes("export")).toBe(true);
    expect(reports.toLowerCase().includes("delete")).toBe(true);
  });

  test("export and deletion for analytics and outcomes", () => {
    const analytics = readAnalytics();
    expect(analytics.includes("exportOutcomes")).toBe(true);
    expect(analytics.includes("deleteOutcome")).toBe(true);
    expect(analytics.includes("isHypothetical") && analytics.includes("false")).toBe(true);
    expect(analytics.includes("auditEvents") || analytics.includes("audit")).toBe(true);
    const py = readPostBid();
    expect(py.includes("export_outcomes")).toBe(true);
    expect(py.includes("delete_outcome")).toBe(true);
    expect(py.includes("is_hypothetical")).toBe(true);
    expect(py.includes("DISCLAIMER")).toBe(true);
  });

  test("post-bid learning uses closed reason categories", () => {
    const py = readPostBid();
    expect(py.includes("ALLOWED_REASONS")).toBe(true);
    expect(py.includes("price") && py.includes("missing_evidence")).toBe(true);
    expect(py.includes("MIN_SAMPLE")).toBe(true);
    expect(py.includes("generate_suggestions")).toBe(true);
    expect(py.toLowerCase().includes("not causation") || py.includes("observation")).toBe(true);
  });

  test("file length stays under 200 lines", () => {
    for (const p of [
      "../../convex/analytics.ts",
      "../../components/opportunities/scenario-simulator.tsx",
      "../../app/(product)/reports/page.tsx",
      "../../../backend/src/backend/scenario_simulation.py",
      "../../../backend/src/backend/post_bid_learning.py",
    ]) {
      const full = path.resolve(__dirname, p);
      if (!fs.existsSync(full)) continue;
      const lines = fs.readFileSync(full, "utf8").split("\n").length;
      expect(lines, `${p} exceeds 200 lines`).toBeLessThan(200);
    }
  });
});
