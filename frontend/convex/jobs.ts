/**
 * Convex job orchestration for the worker contract.
 *
 * Handles creation, dispatch, progress, retryable/permanent failure,
 * cancellation and stale-result rejection with idempotency and traceId.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { throwConflict, throwNotFound, throwValidation } from "./lib/errors";
import { requireOrganization } from "./lib/authorization";

/** All supported job kinds. */
export const JobKinds = [
  "SOURCE_COLLECTION",
  "DOCUMENT_PARSE",
  "DOCUMENT_OCR",
  "REQUIREMENT_EXTRACTION",
  "EMBEDDING",
  "ASSESSMENT",
  "AMENDMENT_DIFF",
  "TENDER_BRIEF",
  "TENDER_QA",
  "COMPLIANCE_MATRIX",
  "PROPOSAL_OUTLINE",
  "PROPOSAL_DRAFT",
  "CLAIM_REVIEW",
  "EXPORT",
  "SUBMISSION_PACKAGE",
  "NOTIFICATION",
] as const;

/** Job lifecycle states. */
export const JobStatuses = [
  "QUEUED",
  "DISPATCHED",
  "RUNNING",
  "NEEDS_REVIEW",
  "SUCCEEDED",
  "RETRYABLE_FAILURE",
  "FAILED",
  "CANCELLED",
] as const;

export type JobKind = (typeof JobKinds)[number];
export type JobStatus = (typeof JobStatuses)[number];

/** Convex validators for kind and status. */
export const jobKindValidator = v.union(v.literal("SOURCE_COLLECTION"),v.literal("DOCUMENT_PARSE"),v.literal("DOCUMENT_OCR"),v.literal("REQUIREMENT_EXTRACTION"),v.literal("EMBEDDING"),v.literal("ASSESSMENT"),v.literal("AMENDMENT_DIFF"),v.literal("TENDER_BRIEF"),v.literal("TENDER_QA"),v.literal("COMPLIANCE_MATRIX"),v.literal("PROPOSAL_OUTLINE"),v.literal("PROPOSAL_DRAFT"),v.literal("CLAIM_REVIEW"),v.literal("EXPORT"),v.literal("SUBMISSION_PACKAGE"),v.literal("NOTIFICATION"));
export const jobStatusValidator = v.union(v.literal("QUEUED"),v.literal("DISPATCHED"),v.literal("RUNNING"),v.literal("NEEDS_REVIEW"),v.literal("SUCCEEDED"),v.literal("RETRYABLE_FAILURE"),v.literal("FAILED"),v.literal("CANCELLED"));

/**
 * Creates a job idempotently; duplicate idempotencyKey returns existing id.
 */
export const createJob = mutation({
  args: {
    organizationId: v.string(),
    kind: jobKindValidator,
    idempotencyKey: v.string(),
    inputRevision: v.string(),
    inputHashes: v.array(v.string()),
    traceId: v.string(),
    maxAttempts: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOrganization(ctx as unknown as Parameters<typeof requireOrganization>[0]);
    const existing = await ctx.db
      .query("jobs")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();
    if (existing) return existing._id;
    const now = Date.now();
    const identity = await ctx.auth.getUserIdentity();
    const requestedBy = identity?.subject ?? "system";
    const id = await ctx.db.insert("jobs", {
      organizationId: args.organizationId,
      kind: args.kind,
      status: "QUEUED",
      idempotencyKey: args.idempotencyKey,
      inputRevision: args.inputRevision,
      inputHashes: args.inputHashes,
      attempt: 0,
      maxAttempts: args.maxAttempts ?? 3,
      traceId: args.traceId,
      requestedBy,
      createdAt: now,
    });
    return id;
  },
});

/**
 * Moves a QUEUED job to DISPATCHED and records start time.
 */
export const dispatchJob = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throwNotFound("Job not found.");
    if (job.status !== "QUEUED") throwConflict("Job already dispatched.");
    await ctx.db.patch(args.jobId, { status: "DISPATCHED", startedAt: Date.now(), attempt: job.attempt + 1 });
    return job._id;
  },
});

/**
 * Updates progressStage for a running job.
 */
export const reportProgress = mutation({
  args: { jobId: v.id("jobs"), progressStage: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throwNotFound("Job not found.");
    if (job.status !== "DISPATCHED" && job.status !== "RUNNING") throwConflict("Job not running.");
    await ctx.db.patch(args.jobId, { status: "RUNNING", progressStage: args.progressStage });
    return job._id;
  },
});

/**
 * Completes a job; rejects stale inputRevision/inputHashes/traceId.
 */
export const completeJob = mutation({
  args: {
    jobId: v.id("jobs"),
    inputRevision: v.string(),
    inputHashes: v.array(v.string()),
    traceId: v.string(),
    outputRefs: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throwNotFound("Job not found.");
    if (job.inputRevision !== args.inputRevision || job.traceId !== args.traceId) throwConflict("Stale result: revision or trace mismatch.");
    const hashesMatch = job.inputHashes.length === args.inputHashes.length && job.inputHashes.every((h, i) => h === args.inputHashes[i]);
    if (!hashesMatch) throwConflict("Stale result: input hashes mismatch.");
    if (job.status === "CANCELLED" || job.status === "SUCCEEDED") throwConflict("Job already terminal.");
    await ctx.db.patch(args.jobId, { status: "SUCCEEDED", completedAt: Date.now(), outputRefs: args.outputRefs, progressStage: "COMPLETE" });
    return job._id;
  },
});

/**
 * Records a failure; retryable increments attempt until maxAttempts.
 */
export const failJob = mutation({
  args: { jobId: v.id("jobs"), retryable: v.boolean(), safeFailureCode: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throwNotFound("Job not found.");
    if (!args.safeFailureCode || !/^[A-Z][A-Z0-9_]*$/.test(args.safeFailureCode)) throwValidation("Invalid safeFailureCode.");
    const shouldRetry = args.retryable && job.attempt < job.maxAttempts;
    const status = shouldRetry ? "RETRYABLE_FAILURE" : "FAILED";
    await ctx.db.patch(args.jobId, { status, safeFailureCode: args.safeFailureCode, completedAt: shouldRetry ? undefined : Date.now() });
    return { status, attempt: job.attempt };
  },
});

/**
 * Cancels a non-terminal job.
 */
export const cancelJob = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throwNotFound("Job not found.");
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job.status)) throwConflict("Cannot cancel terminal job.");
    await ctx.db.patch(args.jobId, { status: "CANCELLED", completedAt: Date.now() });
    return job._id;
  },
});

/**
 * Returns a job by id for client polling.
 */
export const getJob = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throwNotFound("Job not found.");
    return job;
  },
});
