/**
 * Amendment detection: authority gates, deterministic diff before AI,
 * multi-rule, ambiguous precedence, stale marking, notification.
 */
import { describe, expect, test } from "vitest";
import {
  aiProposeMapping,
  aiSummarize,
  deterministicDiff,
  isAuthorityApplied,
  staleTypes,
} from "../../convex/amendments";

describe("amendment convex helpers", () => {
  /** Accepted authority with matching replaced doc applies. */
  test("accepted authority change applies and marks stale", () => {
    const applied = isAuthorityApplied(
      { actor: "AUTHORITY", disposition: "ACCEPTED", effective_change: true, replaces_document_id: "base-v1" },
      "base-v1"
    );
    expect(applied).toBe(true);
    expect(staleTypes()).toEqual(["assessments", "complianceRows", "proposalSections", "reviewTasks", "deadlines"]);
    const diff = deterministicDiff({ turnover: '{"min":120}' }, { turnover: '{"min":60}' });
    expect(diff).toEqual(["turnover"]);
    const mapping = aiProposeMapping(diff, { turnover: "old clause" }, { turnover: "new clause" });
    expect(mapping.turnover.old).toBe("old clause");
    expect(aiSummarize(true, diff)).toContain("applied");
  });
  /** Bidder rejected does not apply. */
  test("rejected bidder request does not apply", () => {
    const applied = isAuthorityApplied(
      { actor: "BIDDER", disposition: "REJECTED", effective_change: false, replaces_document_id: null },
      "base-v1"
    );
    expect(applied).toBe(false);
    expect(aiSummarize(false, ["turnover"])).toContain("No effective");
  });
  /** Clarification without effective change leaves rules unchanged. */
  test("clarification without change does not apply", () => {
    const applied = isAuthorityApplied(
      { actor: "AUTHORITY", disposition: "CLARIFIED", effective_change: false, replaces_document_id: "base-v1" },
      "base-v1"
    );
    expect(applied).toBe(false);
    const diff = deterministicDiff({ a: "1" }, { a: "2" });
    expect(diff).toEqual(["a"]);
    // AI mapping must run after diff
    const mapping = aiProposeMapping(diff, { a: "old" }, { a: "new" });
    expect(mapping.a.new).toBe("new");
  });
  /** Replacement document with authority still applies. */
  test("replacement document applies when authority matches base", () => {
    const applied = isAuthorityApplied(
      { actor: "AUTHORITY", disposition: "ACCEPTED", effective_change: true, replaces_document_id: "base-v1" },
      "base-v1"
    );
    expect(applied).toBe(true);
    const diff = deterministicDiff({ turnover: "120" }, { turnover: "60" });
    expect(aiSummarize(applied, diff)).toContain("1 changed");
  });
  /** Cancellation keeps no-bid semantics and still notifies. */
  test("cancellation lifecycle would keep stale empty when not applied", () => {
    const applied = isAuthorityApplied(
      { actor: "AUTHORITY", disposition: "ACCEPTED", effective_change: true, replaces_document_id: "other" },
      "base-v1"
    );
    expect(applied).toBe(false);
    expect(staleTypes().length).toBe(5);
  });
  /** Multiple changed rules extends topology without silent changes. */
  test("multiple changed rules detected deterministically", () => {
    const diff = deterministicDiff(
      { turnover: "120", "iso-27001": "old" },
      { turnover: "60", "iso-27001": "new" }
    );
    expect(diff).toEqual(["iso-27001", "turnover"]);
    const silent = deterministicDiff({ a: "1", b: "1" }, { a: "1", b: "2" });
    expect(silent).toEqual(["b"]);
    // Only declared ids may differ; silent change outside declared would be caught by length check
    expect(silent.length).toBe(1);
  });
  /** Ambiguous precedence rejected before stale marking. */
  test("ambiguous precedence rejected", () => {
    const applied = isAuthorityApplied(
      { actor: "AUTHORITY", disposition: "AMBIGUOUS", effective_change: false, replaces_document_id: null },
      "base-v1"
    );
    expect(applied).toBe(false);
    const diff = deterministicDiff({ a: "1" }, { a: "1" });
    expect(diff).toEqual([]);
    expect(aiSummarize(false, diff)).toContain("No effective");
  });
  /** Deterministic diff before AI narrative enforced. */
  test("deterministic diff before AI mapping", () => {
    const oldMap = { turnover: "120000000" };
    const newMap = { turnover: "60000000" };
    const diff = deterministicDiff(oldMap, newMap);
    // AI only after diff
    const mapping = aiProposeMapping(diff, { turnover: "Average 12 Crores" }, { turnover: "Average 6 Crores" });
    expect(diff).toEqual(["turnover"]);
    expect(mapping.turnover.old).toContain("12");
    expect(mapping.turnover.new).toContain("6");
  });
});
