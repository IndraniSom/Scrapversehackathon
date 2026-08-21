/**
 * Idempotency helpers for Convex mutations and worker callbacks.
 *
 * Keys are hashed from organization+operation+target+revision and
 * stored uniquely. Duplicate reservations return the first result.
 */
import { throwValidation } from "./errors";

/**
 * Parameters that define a unique idempotent operation.
 */
export type IdempotencyKeyParams = {
  /** Tenant organisation id. */
  organizationId: string;
  /** Operation type, e.g. "opportunity.create". */
  operation: string;
  /** Target resource id. */
  targetId: string;
  /** Input revision or content hash. */
  revision: string;
};

/**
 * Stored idempotency record.
 */
export type IdempotencyRecord = {
  _id: string;
  organizationId: string;
  operation: string;
  targetId: string;
  revision: string;
  idempotencyKey: string;
  status: "reserved" | "completed" | "failed";
  result?: unknown;
  createdAt: number;
  updatedAt: number;
};

/**
 * Result of a reservation attempt.
 */
export type ReserveResult =
  | { status: "reserved"; key: string; recordId: string }
  | { status: "replayed"; key: string; recordId: string; result?: unknown };

/**
 * Minimal Convex context for idempotency.
 */
export type IdempotencyCtx = {
  db: {
    insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    patch: (id: string, patch: Record<string, unknown>) => Promise<void>;
    query: (table: string) => {
      withIndex: (
        index: string,
        fn: (q: { eq: (field: string, value: unknown) => unknown }) => unknown,
      ) => {
        unique: () => Promise<Record<string, unknown> | null>;
        first: () => Promise<Record<string, unknown> | null>;
      };
    };
  };
};

const IDEMPOTENCY_TABLE = "idempotencyRecords";

/** Tracks in-flight reservations to handle concurrent duplicates. */
const pendingReservations = new Map<string, Promise<ReserveResult>>();

/**
 * Hashes a string to 64-char hex using FNV-1a expansion.
 */
export function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let hex = (hash >>> 0).toString(16).padStart(8, "0");
  let seed = hash;
  while (hex.length < 64) {
    seed = Math.imul(seed ^ 0x9e3779b9, 16777619);
    hex += (seed >>> 0).toString(16).padStart(8, "0");
  }
  return hex.slice(0, 64);
}

/**
 * Builds a hashed idempotency key from the four-part tuple.
 *
 * Uses organization|operation|target|revision then hashes, so raw
 * parts are never stored as the key directly.
 */
export function buildIdempotencyKey(params: IdempotencyKeyParams): string {
  validateParams(params);
  const raw = `${params.organizationId}|${params.operation}|${params.targetId}|${params.revision}`;
  return hashString(raw);
}

/**
 * Validates idempotency key params.
 */
function validateParams(p: IdempotencyKeyParams): void {
  const fields: Array<keyof IdempotencyKeyParams> = ["organizationId", "operation", "targetId", "revision"];
  for (const k of fields) {
    const v = p[k];
    if (typeof v !== "string" || v.trim().length === 0) {
      throwValidation(`Idempotency ${String(k)} is required.`);
    }
  }
  if (p.operation.length > 64) throwValidation("Operation too long.");
}

/**
 * Finds a record by hashed key using Convex query.
 */
async function findByKey(ctx: IdempotencyCtx, key: string): Promise<IdempotencyRecord | null> {
  const q = ctx.db.query(IDEMPOTENCY_TABLE).withIndex("by_idempotencyKey", (qb) => qb.eq("idempotencyKey", key));
  const raw = (await q.unique()) ?? (await q.first());
  return raw as IdempotencyRecord | null;
}

/**
 * Reserves an idempotent operation. First caller gets reserved,
 * duplicates get replayed with the first result.
 */
export async function reserveOperation(ctx: IdempotencyCtx, params: IdempotencyKeyParams): Promise<ReserveResult> {
  const key = buildIdempotencyKey(params);
  if (pendingReservations.has(key)) {
    await pendingReservations.get(key);
    const existing = await findByKey(ctx, key);
    if (existing) {
      return { status: "replayed", key, recordId: existing._id, result: existing.result };
    }
  }
  const task = (async (): Promise<ReserveResult> => {
    const existing = await findByKey(ctx, key);
    if (existing) {
      return { status: "replayed", key, recordId: existing._id, result: existing.result };
    }
    const now = Date.now();
    const doc: Record<string, unknown> = {
      organizationId: params.organizationId,
      operation: params.operation,
      targetId: params.targetId,
      revision: params.revision,
      idempotencyKey: key,
      status: "reserved",
      createdAt: now,
      updatedAt: now,
    };
    try {
      const id = await ctx.db.insert(IDEMPOTENCY_TABLE, doc);
      return { status: "reserved", key, recordId: id };
    } catch {
      const again = await findByKey(ctx, key);
      if (again) return { status: "replayed", key, recordId: again._id, result: again.result };
      throw new Error("Reservation failed");
    }
  })();
  pendingReservations.set(key, task);
  try {
    return await task;
  } finally {
    pendingReservations.delete(key);
  }
}

/**
 * Completes a reserved operation with a result to replay.
 */
export async function completeOperation(
  ctx: IdempotencyCtx,
  params: IdempotencyKeyParams,
  result: unknown,
): Promise<void> {
  const key = buildIdempotencyKey(params);
  const existing = await findByKey(ctx, key);
  if (!existing) throwValidation("No reserved operation to complete.");
  await ctx.db.patch(existing._id, { status: "completed", result, updatedAt: Date.now() });
}

/**
 * Returns the replay result for a completed operation, or null.
 */
export async function getReplayResult(ctx: IdempotencyCtx, params: IdempotencyKeyParams): Promise<unknown | null> {
  const key = buildIdempotencyKey(params);
  const rec = await findByKey(ctx, key);
  if (!rec || rec.status !== "completed") return null;
  return rec.result ?? null;
}
