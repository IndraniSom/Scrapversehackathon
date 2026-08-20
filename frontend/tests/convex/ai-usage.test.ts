/**
 * AI governance, rate limits, token tracking, and kill switches.
 */
import { describe, expect, test } from "vitest";
import { ALLOWED_MODELS, AI_FEATURES, RATE_LIMITS, isModelAllowed, isFeatureEnabled, checkRateLimit, estimateCost, computeMetrics, checkGate } from "../../convex/ai";

describe("ai governance", () => {
  test("allowlist restricts models", () => {
    expect(isModelAllowed("deepseek-v4-flash")).toBe(true);
    expect(isModelAllowed("deepseek-v4-pro")).toBe(true);
    expect(isModelAllowed("gpt-4")).toBe(false);
    expect(ALLOWED_MODELS).toEqual(["deepseek-v4-flash", "deepseek-v4-pro"]);
  });

  test("kill switches disable features", () => {
    expect(isFeatureEnabled("extraction", {})).toBe(true);
    expect(isFeatureEnabled("extraction", { extraction: true })).toBe(false);
    expect(isFeatureEnabled("unknown" as never, {})).toBe(false);
    expect(AI_FEATURES).toContain("qa");
    expect(AI_FEATURES).toContain("amendment_mapping");
  });

  test("per-user, per-org, global limits with retry", () => {
    expect(checkRateLimit({ perUser: 9, perOrg: 50, perGlobal: 500 }).allowed).toBe(true);
    expect(checkRateLimit({ perUser: 10, perOrg: 50, perGlobal: 500 }).allowed).toBe(false);
    expect(checkRateLimit({ perUser: 10, perOrg: 50, perGlobal: 500 }).retryAfterMs).toBe(60000);
    expect(checkRateLimit({ perUser: 5, perOrg: 100, perGlobal: 500 }).limited).toBe("perOrg");
    expect(checkRateLimit({ perUser: 5, perOrg: 50, perGlobal: 1000 }).limited).toBe("perGlobal");
    expect(RATE_LIMITS.perUser).toBe(10);
    expect(RATE_LIMITS.perOrg).toBe(100);
    expect(RATE_LIMITS.perGlobal).toBe(1000);
  });

  test("token tracking estimates cost without prompt logging", () => {
    expect(estimateCost(1000, 500)).toBe(0.002);
    expect(estimateCost(0, 0)).toBe(0);
    expect(estimateCost(2000, 0)).toBe(0.002);
  });

  test("metrics and gate require zero hard unsupported and zero cross-tenant", () => {
    const cases = [
      { expectedCitedIds: ["a"], hardClause: true, requiresAbstention: false },
      { expectedCitedIds: ["b"], hardClause: false, requiresAbstention: true },
    ];
    const ok = [
      { schema_valid: true, cited_ids: ["a"], excerpt_located: true, unsupported_claim: false, cross_tenant: false, abstained: false },
      { schema_valid: true, cited_ids: ["b"], excerpt_located: true, unsupported_claim: false, cross_tenant: false, abstained: true },
    ];
    const m = computeMetrics(cases, ok);
    expect(m.schemaValidity).toBe(1);
    expect(m.precision).toBe(1);
    expect(checkGate(m).enabled).toBe(true);

    const badHard = [
      { schema_valid: true, cited_ids: ["a"], excerpt_located: true, unsupported_claim: true, cross_tenant: false, abstained: false },
      { schema_valid: true, cited_ids: ["b"], excerpt_located: true, unsupported_claim: false, cross_tenant: false, abstained: true },
    ];
    const m2 = computeMetrics(cases, badHard);
    expect(checkGate(m2).enabled).toBe(false);
    expect(checkGate(m2).blocked).toContain("unsupported_hard_clause");

    const cross = [
      { schema_valid: true, cited_ids: ["a"], excerpt_located: true, unsupported_claim: false, cross_tenant: true, abstained: false },
      { schema_valid: true, cited_ids: ["b"], excerpt_located: true, unsupported_claim: false, cross_tenant: false, abstained: true },
    ];
    expect(checkGate(computeMetrics(cases, cross)).blocked).toContain("cross_tenant_retrieval");
  });

  test("precision and recall degrade with missing or extra citations", () => {
    const cases = [{ expectedCitedIds: ["a", "b"] }];
    const partial = [{ schema_valid: true, cited_ids: ["a"], excerpt_located: true, unsupported_claim: false, cross_tenant: false, abstained: false }];
    const m = computeMetrics(cases, partial);
    expect(m.precision).toBe(1);
    expect(m.recall).toBe(0.5);
    const extra = [{ schema_valid: true, cited_ids: ["a", "b", "c"], excerpt_located: true, unsupported_claim: false, cross_tenant: false, abstained: false }];
    const m2 = computeMetrics(cases, extra);
    expect(m2.precision).toBeLessThan(1);
  });
});
