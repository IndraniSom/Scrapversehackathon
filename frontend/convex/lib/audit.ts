/**
 * Append-only audit helper for BidRadar.
 *
 * Records immutable audit events with before/after digests rather than
 * sensitive bodies. No update or delete operation is exported.
 */
import { throwValidation } from "./errors";
import type { Id } from "../_generated/dataModel";

/**
 * Input for an audit event. Bodies are hashed, never stored raw.
 */
export type AuditEventInput = {
  /** Tenant organisation id. */
  organizationId: string;
  /** Actor user id (clerk id or system). */
  actorId: string;
  /** Action name, e.g. "opportunity.update". */
  action: string;
  /** Target resource type. */
  targetType: string;
  /** Target resource id. */
  targetId: string;
  /** Bounded before state (optional). */
  before?: unknown;
  /** Bounded after state (optional). */
  after?: unknown;
  /** Trace id for correlation. */
  traceId?: string;
};

/**
 * Minimal Convex mutation context for audit.
 */
export type AuditCtx = {
  db: {
    insert: (table: "auditEvents", doc: Record<string, unknown>) => Promise<Id<"auditEvents">>;
  };
};

/**
 * Deterministic JSON stringify with sorted keys.
 *
 * Ensures equal digests for semantically equal objects regardless of key order.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${parts.join(",")}}`;
}

/**
 * Hashes a string to a 64-char hex digest.
 *
 * Uses FNV-1a expansion to 64 hex chars; deterministic and not reversible
 * to raw input. Mirrors SHA-256 length for audit consistency.
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
 * Builds a hex digest for a value, or undefined when absent.
 *
 * Uses stableStringify then hashString so digests are deterministic.
 */
export function digestValue(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return hashString(stableStringify(value));
}

/**
 * Validates audit input fields.
 *
 * Throws VALIDATION_FAILED when required fields are missing or blank.
 */
function validateAuditInput(input: AuditEventInput): void {
  const required: Array<keyof AuditEventInput> = ["organizationId", "actorId", "action", "targetType", "targetId"];
  for (const key of required) {
    const v = input[key];
    if (typeof v !== "string" || v.trim().length === 0) {
      throwValidation(`Audit ${String(key)} is required.`);
    }
  }
  if (input.action.length > 128) throwValidation("Audit action too long.");
  if (input.targetType.length > 64) throwValidation("Audit targetType too long.");
}

/**
 * Appends an immutable audit event with before/after digests.
 *
 * Stores only digests, never raw sensitive bodies, and returns the new id.
 * No update or delete helper exists; audit events are append-only.
 */
export async function appendAuditEvent(
  ctx: AuditCtx,
  input: AuditEventInput,
): Promise<Id<"auditEvents">> {
  validateAuditInput(input);
  const beforeDigest = digestValue(input.before);
  const afterDigest = digestValue(input.after);
  const doc: Record<string, unknown> = {
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    beforeDigest,
    afterDigest,
    traceId: input.traceId,
    createdAt: Date.now(),
  };
  // Remove undefined digests to keep storage bounded and explicit.
  if (beforeDigest === undefined) delete doc.beforeDigest;
  if (afterDigest === undefined) delete doc.afterDigest;
  if (input.traceId === undefined) delete doc.traceId;
  return ctx.db.insert("auditEvents", doc);
}
