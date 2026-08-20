import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const examplesDirectory = resolve(process.cwd(), "../contracts/examples");

/** Reads one frozen JSON example from the shared contract directory. */
function readExample(name: string): unknown {
  return JSON.parse(
    readFileSync(resolve(examplesDirectory, name), "utf8"),
  ) as unknown;
}

describe("frozen API examples", () => {
  test("keeps the seven-row inventory aligned with the official Odisha tender", () => {
    const example = readExample("opportunities.manual.json");

    expect(example).toMatchObject({
      data: {
        total: 7,
        items: [
          { source: "CPPP" },
          { source: "CPPP" },
          { source: "WEST_BENGAL" },
          { source: "WEST_BENGAL" },
          { source: "NTPC" },
          { source: "NTPC" },
          {
            id: "ocac-pond-monitoring-26001",
            source: "ODISHA",
            source_tender_id: "OCAC-SASCI-CPMU-0001-2025-26001",
            reference_number: "OCAC-SASCI-CPMU-0001-2025-26001",
            authority: "Odisha Computer Application Centre",
            title: "RFP for Selection of System Integrator for Development, Implementation, Operation & Maintenance Support of AI-enabled IoT-based Pond Monitoring and Advisory System for Fish Farming.",
            category: "SOFTWARE",
            published_at: null,
            closes_at: null,
            canonical_url: "https://odisha.gov.in/sites/default/files/2026-01/RFP-26001_03.01.2026_1.pdf",
            data_mode: "MANUAL_FIXTURE",
            snapshot_sha256: "f1bc41678cd71b0d20cd2432cf579b840af7a52152b72d8c55a5ee129b927afd",
          },
        ],
      },
    });
  });

  test("keeps unsupported certification anchors unknown in the four-rule transition", () => {
    const example = readExample("assessment.manual.json");

    expect(example).toMatchObject({
      data: {
        opportunity: { data_mode: "MANUAL_FIXTURE" },
        base_assessment: {
          recommendation: "NO_BID",
          unknown_applicable_rule_count: 3,
          failed_hard_rule_count: 1,
        },
        amended_assessment: {
          recommendation: "REVIEW",
          unknown_applicable_rule_count: 3,
          failed_hard_rule_count: 0,
        },
      },
    });
    const serialized = JSON.stringify(example);
    expect(serialized.match(/"valid_at":null/g)).toHaveLength(6);
    expect(serialized.match(/"evaluation":"UNKNOWN"/g)).toHaveLength(7);
  });

  test("keeps unavailable source proof manual and free of provider claims", () => {
    const example = readExample("source-proof.manual.json");

    expect(example).toMatchObject({
      data: {
        status: "UNAVAILABLE",
        data_mode: "MANUAL_FIXTURE",
        provider_run_id: null,
        started_at: null,
        completed_at: null,
      },
    });
    expect(JSON.stringify(example)).not.toContain(
      "RECORDED_BRIGHT_DATA_SNAPSHOT",
    );
  });
});
