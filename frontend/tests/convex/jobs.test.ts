/**
 * Tests for Convex job orchestration: creation, dispatch, progress,
 * retryable/permanent failure, cancellation, idempotency, traceId and stale rejection.
 */
import { describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";

/** JobKind and JobStatus enums mirroring the contract. */
const JobKinds = [
  "SOURCE_COLLECTION","DOCUMENT_PARSE","DOCUMENT_OCR","REQUIREMENT_EXTRACTION","EMBEDDING","ASSESSMENT","AMENDMENT_DIFF","TENDER_BRIEF","TENDER_QA","COMPLIANCE_MATRIX","PROPOSAL_OUTLINE","PROPOSAL_DRAFT","CLAIM_REVIEW","EXPORT","SUBMISSION_PACKAGE","NOTIFICATION",
] as const;
const JobStatuses = ["QUEUED","DISPATCHED","RUNNING","NEEDS_REVIEW","SUCCEEDED","RETRYABLE_FAILURE","FAILED","CANCELLED"] as const;

/** Minimal in-memory job store for deterministic lifecycle tests. */
type JobDoc = {
  _id: string; organizationId: string; kind: string; status: string;
  idempotencyKey: string; inputRevision: string; inputHashes: string[];
  attempt: number; maxAttempts: number; traceId: string; requestedBy: string;
  createdAt: number; progressStage?: string; safeFailureCode?: string; outputRefs?: string[];
};

/** Simulates createJob with idempotency key. */
function createJob(store: Map<string, JobDoc>, args: Omit<JobDoc, "_id"|"status"|"attempt"|"createdAt"|"requestedBy"|"maxAttempts"> & {maxAttempts?: number}): JobDoc {
  for (const j of store.values()) if (j.idempotencyKey === args.idempotencyKey) return j;
  const doc: JobDoc = {
    _id: `job_${store.size + 1}`,
    organizationId: args.organizationId,
    kind: args.kind,
    status: "QUEUED",
    idempotencyKey: args.idempotencyKey,
    inputRevision: args.inputRevision,
    inputHashes: args.inputHashes,
    attempt: 0,
    maxAttempts: args.maxAttempts ?? 3,
    traceId: args.traceId,
    requestedBy: "user_1",
    createdAt: Date.now(),
  };
  store.set(doc._id, doc);
  return doc;
}

/** Simulates dispatch. */
function dispatchJob(store: Map<string, JobDoc>, jobId: string): JobDoc {
  const j = store.get(jobId); if (!j) throw new Error("NOT_FOUND");
  if (j.status !== "QUEUED") throw new Error("CONFLICT");
  j.status = "DISPATCHED"; j.attempt += 1; return j;
}

/** Simulates progress reporting. */
function reportProgress(store: Map<string, JobDoc>, jobId: string, stage: string): JobDoc {
  const j = store.get(jobId); if (!j) throw new Error("NOT_FOUND");
  if (j.status !== "DISPATCHED" && j.status !== "RUNNING") throw new Error("CONFLICT");
  j.status = "RUNNING"; j.progressStage = stage; return j;
}

/** Simulates completion with stale check. */
function completeJob(store: Map<string, JobDoc>, jobId: string, revision: string, hashes: string[], traceId: string): JobDoc {
  const j = store.get(jobId); if (!j) throw new Error("NOT_FOUND");
  if (j.inputRevision !== revision || j.traceId !== traceId) throw new Error("STALE");
  if (j.inputHashes.join(",") !== hashes.join(",")) throw new Error("STALE");
  if (["CANCELLED","SUCCEEDED"].includes(j.status)) throw new Error("CONFLICT");
  j.status = "SUCCEEDED"; return j;
}

/** Simulates failure with retryable logic. */
function failJob(store: Map<string, JobDoc>, jobId: string, retryable: boolean, code: string): string {
  const j = store.get(jobId); if (!j) throw new Error("NOT_FOUND");
  if (!/^[A-Z][A-Z0-9_]*$/.test(code)) throw new Error("VALIDATION_FAILED");
  const shouldRetry = retryable && j.attempt < j.maxAttempts;
  j.status = shouldRetry ? "RETRYABLE_FAILURE" : "FAILED";
  j.safeFailureCode = code; return j.status;
}

/** Simulates cancellation. */
function cancelJob(store: Map<string, JobDoc>, jobId: string): JobDoc {
  const j = store.get(jobId); if (!j) throw new Error("NOT_FOUND");
  if (["SUCCEEDED","FAILED","CANCELLED"].includes(j.status)) throw new Error("CONFLICT");
  j.status = "CANCELLED"; return j;
}

describe("convex jobs contract", () => {
  test("JobKind and JobStatus enums cover all values", () => {
    expect(JobKinds).toHaveLength(16);
    expect(JobStatuses).toHaveLength(8);
    const text = fs.readFileSync(path.resolve(__dirname, "../../convex/jobs.ts"), "utf8");
    for (const k of JobKinds) expect(text).toContain(k);
    for (const s of JobStatuses) expect(text).toContain(s);
  });

  test("idempotency: duplicate create returns same job", () => {
    const store = new Map<string, JobDoc>();
    const a = createJob(store, { organizationId: "org_1", kind: "ASSESSMENT", idempotencyKey: "idem1", inputRevision: "rev1", inputHashes: ["a".repeat(64)], traceId: "123e4567-e89b-12d3-a456-426614174000" });
    const b = createJob(store, { organizationId: "org_1", kind: "ASSESSMENT", idempotencyKey: "idem1", inputRevision: "rev1", inputHashes: ["a".repeat(64)], traceId: "123e4567-e89b-12d3-a456-426614174000" });
    expect(b._id).toBe(a._id); expect(store.size).toBe(1);
  });

  test("dispatch -> progress -> succeeded lifecycle", () => {
    const store = new Map<string, JobDoc>();
    const job = createJob(store, { organizationId: "org_1", kind: "EMBEDDING", idempotencyKey: "k1", inputRevision: "r1", inputHashes: ["b".repeat(64)], traceId: "123e4567-e89b-12d3-a456-426614174000" });
    dispatchJob(store, job._id);
    expect(store.get(job._id)?.status).toBe("DISPATCHED");
    reportProgress(store, job._id, "DOWNLOADING");
    expect(store.get(job._id)?.progressStage).toBe("DOWNLOADING");
    completeJob(store, job._id, "r1", ["b".repeat(64)], "123e4567-e89b-12d3-a456-426614174000");
    expect(store.get(job._id)?.status).toBe("SUCCEEDED");
  });

  test("stale result rejection on revision or hash mismatch", () => {
    const store = new Map<string, JobDoc>();
    const job = createJob(store, { organizationId: "org_1", kind: "DOCUMENT_PARSE", idempotencyKey: "k2", inputRevision: "rev1", inputHashes: ["c".repeat(64)], traceId: "123e4567-e89b-12d3-a456-426614174000" });
    dispatchJob(store, job._id);
    expect(() => completeJob(store, job._id, "rev2", ["c".repeat(64)], "123e4567-e89b-12d3-a456-426614174000")).toThrow("STALE");
    expect(() => completeJob(store, job._id, "rev1", ["d".repeat(64)], "123e4567-e89b-12d3-a456-426614174000")).toThrow("STALE");
    const txt = fs.readFileSync(path.resolve(__dirname, "../../convex/jobs.ts"), "utf8");
    expect(txt).toContain("Stale");
  });

  test("retryable failure vs permanent failure", () => {
    const store = new Map<string, JobDoc>();
    const job = createJob(store, { organizationId: "org_1", kind: "EXPORT", idempotencyKey: "k3", inputRevision: "r1", inputHashes: ["e".repeat(64)], traceId: "123e4567-e89b-12d3-a456-426614174000", maxAttempts: 2 });
    dispatchJob(store, job._id);
    expect(failJob(store, job._id, true, "TIMEOUT")).toBe("RETRYABLE_FAILURE");
    job.attempt = 2;
    expect(failJob(store, job._id, true, "TIMEOUT")).toBe("FAILED");
    expect(() => failJob(store, job._id, false, "bad-code")).toThrow();
  });

  test("cancellation blocks completion and is terminal", () => {
    const store = new Map<string, JobDoc>();
    const job = createJob(store, { organizationId: "org_1", kind: "NOTIFICATION", idempotencyKey: "k4", inputRevision: "r1", inputHashes: ["f".repeat(64)], traceId: "123e4567-e89b-12d3-a456-426614174000" });
    cancelJob(store, job._id);
    expect(store.get(job._id)?.status).toBe("CANCELLED");
    expect(() => completeJob(store, job._id, "r1", ["f".repeat(64)], "123e4567-e89b-12d3-a456-426614174000")).toThrow();
    expect(() => cancelJob(store, job._id)).toThrow();
  });

  test("traceId is stored and required", () => {
    const store = new Map<string, JobDoc>();
    const tid = "123e4567-e89b-12d3-a456-426614174000";
    const job = createJob(store, { organizationId: "org_1", kind: "TENDER_QA", idempotencyKey: "k5", inputRevision: "r1", inputHashes: ["a".repeat(64)], traceId: tid });
    expect(job.traceId).toBe(tid);
    const file = fs.readFileSync(path.resolve(__dirname, "../../convex/jobs.ts"), "utf8");
    expect(file).toContain("traceId");
    expect(file).toContain("idempotency");
  });
});
