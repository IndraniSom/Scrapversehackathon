import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const examplesDirectory = resolve(process.cwd(), "../contracts/examples");

/** Reads a frozen contract example without asserting an unchecked shape. */
export function readFixture(name: string): unknown {
  const parsed: unknown = JSON.parse(readFileSync(resolve(examplesDirectory, name), "utf8"));
  return parsed;
}

/** Returns a JSON-compatible deep copy for isolated mutation tests. */
export function cloneFixture(value: unknown): unknown {
  return structuredClone(value);
}

/** Creates a complete JSON response for a network-boundary test. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Narrows an unknown JSON value to a mutable object for negative tests. */
export function objectValue(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError("Expected fixture object");
  return value;
}

/** Identifies a non-null, non-array JSON object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads and narrows a named object property from a fixture. */
export function objectProperty(value: unknown, key: string): Record<string, unknown> {
  return objectValue(objectValue(value)[key]);
}

/** Reads and narrows a named array property from a fixture object. */
export function arrayProperty(value: unknown, key: string): unknown[] {
  const candidate = objectValue(value)[key];
  if (!Array.isArray(candidate)) throw new TypeError(`Expected fixture array at ${key}`);
  return candidate;
}

/** Builds a closed VERIFIED proof with recorded mode and linked snapshot hashes. */
export function verifiedProofFixture(): unknown {
  const opportunities = readFixture("opportunities.manual.json");
  const normalized = cloneFixture(arrayProperty(objectProperty(opportunities, "data"), "items")[0]);
  const normalizedRecord = objectValue(normalized);
  const snapshotHash = "7777777777777777777777777777777777777777777777777777777777777777";
  normalizedRecord.data_mode = "RECORDED_BRIGHT_DATA_SNAPSHOT";
  normalizedRecord.snapshot_sha256 = snapshotHash;
  return {
    request_id: "55555555-5555-4555-8555-555555555555",
    data: {
      status: "VERIFIED",
      data_mode: "RECORDED_BRIGHT_DATA_SNAPSHOT",
      reason_code: null,
      collector_name: "bright-data-collector",
      collector_config_version: "collector-v7",
      provider_run_id: "provider-run-2042",
      started_at: "2026-08-20T07:58:00Z",
      completed_at: "2026-08-20T08:00:00Z",
      raw_snapshot_sha256: snapshotHash,
      raw_record: { raw_tender_id: "CPPP-2026-001", capture_sequence: 42 },
      normalized_record: normalizedRecord,
      terminal_state: "SUCCESS",
      failure_code: null,
    },
  };
}
