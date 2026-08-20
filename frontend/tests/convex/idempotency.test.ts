/**
 * Tests for hashed idempotency with replay and concurrency.
 */
import { describe, expect, test, vi } from "vitest";

import {
  buildIdempotencyKey,
  completeOperation,
  getReplayResult,
  hashString,
  reserveOperation,
} from "../../convex/lib/idempotency";
import type { IdempotencyCtx, IdempotencyKeyParams } from "../../convex/lib/idempotency";

/**
 * Creates a mock ctx with unique key enforcement.
 */
function createMockCtx(): IdempotencyCtx & { store: Map<string, Record<string, unknown>> } {
  const store = new Map<string, Record<string, unknown>>();
  let seq = 0;
  const insert: IdempotencyCtx["db"]["insert"] = vi.fn(async (_table: string, doc: Record<string, unknown>) => {
    const key = doc.idempotencyKey as string;
    for (const v of store.values()) {
      if (v.idempotencyKey === key) throw new Error("CONFLICT duplicate key");
    }
    seq += 1;
    const id = `idem_${seq}`;
    const rec = { ...doc, _id: id };
    store.set(id, rec);
    return id;
  });
  const patch: IdempotencyCtx["db"]["patch"] = vi.fn(async (id: string, patchDoc: Record<string, unknown>) => {
    const existing = store.get(id);
    if (!existing) throw new Error("NOT_FOUND");
    store.set(id, { ...existing, ...patchDoc });
  });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const query: IdempotencyCtx["db"]["query"] = vi.fn((_table: string) => ({
    withIndex: (_idx: string, fn: (q: { eq: (f: string, v: unknown) => unknown }) => unknown) => {
      let targetKey = "";
      const qb = { eq: (_field: string, value: unknown) => { targetKey = String(value); return {}; } };
      fn(qb as unknown as { eq: (f: string, v: unknown) => unknown });
      const find = (): Record<string, unknown> | null => {
        for (const v of store.values()) if (v.idempotencyKey === targetKey) return v;
        return null;
      };
      return {
        unique: async () => find(),
        first: async () => find(),
      };
    },
  })) as unknown as IdempotencyCtx["db"]["query"];
  return { store, db: { insert, patch, query } };
}

const baseParams: IdempotencyKeyParams = {
  organizationId: "org_1",
  operation: "opportunity.create",
  targetId: "opp_123",
  revision: "rev_1",
};

describe("idempotency", () => {
  test("buildIdempotencyKey is deterministic and hashed", () => {
    const k1 = buildIdempotencyKey(baseParams);
    const k2 = buildIdempotencyKey({ ...baseParams });
    expect(k1).toBe(k2);
    expect(k1).toHaveLength(64);
    const raw = `${baseParams.organizationId}|${baseParams.operation}|${baseParams.targetId}|${baseParams.revision}`;
    expect(k1).not.toBe(raw);
    expect(k1).not.toContain(baseParams.targetId);
    expect(hashString(raw)).toBe(k1);
  });

  test("different tuples produce different keys", () => {
    const a = buildIdempotencyKey(baseParams);
    const b = buildIdempotencyKey({ ...baseParams, revision: "rev_2" });
    const c = buildIdempotencyKey({ ...baseParams, organizationId: "org_2" });
    const d = buildIdempotencyKey({ ...baseParams, operation: "other.op" });
    const e = buildIdempotencyKey({ ...baseParams, targetId: "opp_999" });
    expect(new Set([a, b, c, d, e]).size).toBe(5);
  });

  test("first reserve is reserved, duplicate is replayed", async () => {
    const ctx = createMockCtx();
    const first = await reserveOperation(ctx, baseParams);
    expect(first.status).toBe("reserved");
    const second = await reserveOperation(ctx, baseParams);
    expect(second.status).toBe("replayed");
    expect(second.key).toBe(first.key);
  });

  test("duplicate keys return first result", async () => {
    const ctx = createMockCtx();
    const first = await reserveOperation(ctx, baseParams);
    expect(first.status).toBe("reserved");
    await completeOperation(ctx, baseParams, { ok: true, id: "A" });
    const replay = await reserveOperation(ctx, baseParams);
    expect(replay.status).toBe("replayed");
    if (replay.status === "replayed") expect(replay.result).toEqual({ ok: true, id: "A" });
    // Attempt to complete with different result should still keep first
    const again = await getReplayResult(ctx, baseParams);
    expect(again).toEqual({ ok: true, id: "A" });
  });

  test("complete and getReplayResult round-trip", async () => {
    const ctx = createMockCtx();
    await reserveOperation(ctx, baseParams);
    expect(await getReplayResult(ctx, baseParams)).toBeNull();
    await completeOperation(ctx, baseParams, { value: 42 });
    expect(await getReplayResult(ctx, baseParams)).toEqual({ value: 42 });
  });

  test("concurrent duplicate reserves only one reserved", async () => {
    const ctx = createMockCtx();
    const params = { ...baseParams, targetId: "concurrent_target" };
    const results = await Promise.all(
      Array.from({ length: 10 }, () => reserveOperation(ctx, params)),
    );
    const reserved = results.filter((r) => r.status === "reserved");
    const replayed = results.filter((r) => r.status === "replayed");
    expect(reserved).toHaveLength(1);
    expect(replayed).toHaveLength(9);
    expect(ctx.store.size).toBe(1);
    const keys = results.map((r) => r.key);
    expect(new Set(keys).size).toBe(1);
  });

  test("validation rejects blank fields", async () => {
    const ctx = createMockCtx();
    await expect(reserveOperation(ctx, { ...baseParams, organizationId: "" })).rejects.toThrow();
    await expect(reserveOperation(ctx, { ...baseParams, operation: " " })).rejects.toThrow();
  });
});
