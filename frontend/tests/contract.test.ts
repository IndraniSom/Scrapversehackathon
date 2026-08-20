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
  test("keeps the deterministic assessment transition free of unknown applicable rules", () => {
    const example = readExample("assessment.manual.json");

    expect(example).toMatchObject({
      data: {
        opportunity: { data_mode: "MANUAL_FIXTURE" },
        base_assessment: {
          recommendation: "NO_BID",
          unknown_applicable_rule_count: 0,
        },
        amended_assessment: {
          recommendation: "BID",
          unknown_applicable_rule_count: 0,
        },
      },
    });
    expect(JSON.stringify(example)).not.toContain('"evaluation":"UNKNOWN"');
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
