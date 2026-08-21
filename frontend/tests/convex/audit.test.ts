/**
 * Tests for append-only audit with before/after digests.
 */
import { describe, expect, test, vi } from "vitest";

import * as audit from "../../convex/lib/audit";
import { appendAuditEvent, digestValue, hashString, stableStringify } from "../../convex/lib/audit";
import type { AuditCtx } from "../../convex/lib/audit";

/**
 * Creates a mock Convex ctx that captures inserts.
 */
function createMockCtx(): AuditCtx & { docs: Record<string, unknown>[] } {
  const docs: Record<string, unknown>[] = [];
  return {
    docs,
    db: {
      insert: vi.fn(async (_table: string, doc: Record<string, unknown>) => {
        docs.push(doc);
        return `audit_${docs.length}` as unknown as ReturnType<AuditCtx["db"]["insert"]>;
      }),
    },
  };
}

describe("audit append-only", () => {
  test("append creates digests not raw bodies", async () => {
    const ctx = createMockCtx();
    const before = { amount: 12, currency: "INR" };
    const after = { amount: 6, currency: "INR" };
    await appendAuditEvent(ctx, {
      organizationId: "org_1",
      actorId: "user_1",
      action: "opportunity.update",
      targetType: "opportunity",
      targetId: "opp_1",
      before,
      after,
      traceId: "trace-1",
    });
    expect(ctx.docs).toHaveLength(1);
    const doc = ctx.docs[0] as Record<string, unknown>;
    expect(doc.beforeDigest).toBeDefined();
    expect(doc.afterDigest).toBeDefined();
    expect(doc.beforeDigest).not.toEqual(before);
    expect(doc.afterDigest).not.toEqual(after);
    // Raw bodies never stored
    expect(doc.before).toBeUndefined();
    expect(doc.after).toBeUndefined();
    expect(doc.organizationId).toBe("org_1");
    expect(typeof doc.createdAt).toBe("number");
  });

  test("digests are deterministic and order independent", () => {
    const a = { b: 2, a: 1 };
    const b = { a: 1, b: 2 };
    expect(digestValue(a)).toBe(digestValue(b));
    expect(digestValue({ x: 1 })).not.toBe(digestValue({ x: 2 }));
    expect(hashString("hello")).toHaveLength(64);
    expect(hashString("hello")).toBe(hashString("hello"));
  });

  test("stableStringify sorts keys", () => {
    expect(stableStringify({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(stableStringify([3, 1])).toBe("[3,1]");
  });

  test("does not expose update or delete via public functions", () => {
    const exports = Object.keys(audit);
    expect(exports).toContain("appendAuditEvent");
    expect(exports).not.toContain("updateAuditEvent");
    expect(exports).not.toContain("deleteAuditEvent");
    expect(exports).not.toContain("patchAuditEvent");
    // Only expected helpers
    for (const name of exports) {
      expect(["appendAuditEvent", "digestValue", "hashString", "stableStringify"]).toContain(name);
    }
  });

  test("appended events are immutable (stored copy not mutated)", async () => {
    const ctx = createMockCtx();
    const before = { v: 1 };
    await appendAuditEvent(ctx, {
      organizationId: "org_1",
      actorId: "user_1",
      action: "company.archive",
      targetType: "company",
      targetId: "co_1",
      before,
    });
    // Mutate original input after insert
    before.v = 99;
    const stored = ctx.docs[0] as Record<string, unknown>;
    const originalDigest = digestValue({ v: 1 });
    expect(stored.beforeDigest).toBe(originalDigest);
    expect(stored.beforeDigest).not.toBe(digestValue({ v: 99 }));
  });

  test("concurrent appends create distinct events", async () => {
    const ctx = createMockCtx();
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        appendAuditEvent(ctx, {
          organizationId: "org_1",
          actorId: `user_${i}`,
          action: "opportunity.create",
          targetType: "opportunity",
          targetId: `opp_${i}`,
          after: { idx: i },
        }),
      ),
    );
    expect(results).toHaveLength(5);
    expect(ctx.docs).toHaveLength(5);
    const digests = (ctx.docs as Record<string, unknown>[]).map((d) => d.afterDigest);
    expect(new Set(digests).size).toBe(5);
  });

  test("validation rejects blank required fields", async () => {
    const ctx = createMockCtx();
    await expect(
      appendAuditEvent(ctx, {
        organizationId: "",
        actorId: "user_1",
        action: "a",
        targetType: "t",
        targetId: "id",
      }),
    ).rejects.toThrow();
  });
});
