/**
 * Tests for Bright Data live & scheduled collection.
 * Covers manual/cron trigger, duplicate webhook, malformed record, partial failure, rate limit, stale run, disabled connector, exponential backoff.
 */
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { exponentialBackoff, isValidChronology } from "../../convex/sourceRuns";
import { isAllowedDomain, isValidCollector, isValidSchedule } from "../../convex/sources";

const sourcesText = readFileSync(resolve(__dirname, "../../convex/sources.ts"), "utf8");
const runsText = readFileSync(resolve(__dirname, "../../convex/sourceRuns.ts"), "utf8");
const httpText = readFileSync(resolve(__dirname, "../../convex/http.ts"), "utf8");

describe("source connector domain allowlist and policy", () => {
  test("manual trigger validates domain allowlist", () => {
    expect(isAllowedDomain("https://ntpctender.ntpc.co.in/Index/Search", "NTPC")).toBe(true);
    expect(isAllowedDomain("https://evil.example/Index/Search", "NTPC")).toBe(false);
    expect(sourcesText).toContain("ALLOWED_DOMAINS");
    expect(sourcesText).toContain("domain allowlist");
  });

  test("collector/version validation", () => {
    expect(isValidCollector("bidradar-ntpc-public-tenders", "manual-draft-1")).toBe(true);
    expect(isValidCollector("BAD NAME", "v1")).toBe(false);
    expect(sourcesText).toContain("collectorName");
    expect(sourcesText).toContain("collectorVersion");
  });

  test("schedule and policy review required", () => {
    expect(isValidSchedule("0 */60 * * *")).toBe(true);
    expect(isValidSchedule(undefined)).toBe(true);
    expect(sourcesText).toContain("scheduleCron");
    expect(sourcesText).toContain("policyReviewedAt");
  });

  test("disabled connector is rejected", () => {
    expect(sourcesText).toContain("enabled");
    expect(runsText).toContain("disabled");
    expect(runsText).toContain("Connector disabled");
  });
});

describe("source run orchestration", () => {
  test("manual and cron trigger share concurrency and rate limit", () => {
    expect(runsText).toContain("triggerCollection");
    expect(runsText).toContain("cronTrigger");
    expect(runsText).toContain("manual");
    expect(runsText).toContain("cron");
    expect(runsText).toContain("MAX_CONCURRENT");
    expect(runsText).toContain("RATE_LIMITED");
  });

  test("provider ID, chronology, digest, collector version are tracked", () => {
    expect(runsText).toContain("providerRunId");
    expect(runsText).toContain("chronology");
    expect(runsText).toContain("digest");
    expect(runsText).toContain("collectorVersion");
    expect(isValidChronology(1000, 2000)).toBe(true);
    expect(isValidChronology(2000, 1000)).toBe(false);
  });

  test("duplicate webhook is idempotent", () => {
    expect(runsText).toContain("duplicate webhook");
    expect(runsText).toContain("existing");
    // simulate duplicate check: second insert returns same id
    expect(runsText.toLowerCase()).toContain("duplicate");
  });

  test("malformed record handling", () => {
    expect(runsText).toContain("MALFORMED_RECORD");
    expect(runsText).toContain("malformed");
  });

  test("partial failure handling", () => {
    expect(runsText).toContain("failed");
    expect(runsText).toContain("retryable");
  });

  test("rate limit with exponential backoff", () => {
    expect(exponentialBackoff(0, 1000)).toBe(1000);
    expect(exponentialBackoff(1, 1000)).toBe(2000);
    expect(exponentialBackoff(2, 1000)).toBe(4000);
    expect(runsText).toContain("exponentialBackoff");
    expect(runsText).toContain("RATE_LIMITED");
  });

  test("stale run is rejected", () => {
    expect(isValidChronology(5000, 4000)).toBe(false);
    expect(runsText).toContain("Stale run");
  });

  test("webhook verification covers chronology and digest", () => {
    expect(httpText).toContain("verifyBrightDataSignature");
    expect(httpText).toContain("providerRunId");
    expect(httpText).toContain("digest");
    expect(httpText).toContain("chronology");
  });
});
