/** Tenant-bound Convex job orchestration. */
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { throwConflict, throwNotFound, throwValidation } from "./lib/errors";
import { requireOrganization } from "./lib/authorization";

/** All supported job kinds. */
export const JobKinds = ["SOURCE_COLLECTION", "DOCUMENT_PARSE", "DOCUMENT_OCR", "REQUIREMENT_EXTRACTION", "EMBEDDING", "ASSESSMENT", "AMENDMENT_DIFF", "TENDER_BRIEF", "TENDER_QA", "COMPLIANCE_MATRIX", "PROPOSAL_OUTLINE", "PROPOSAL_DRAFT", "CLAIM_REVIEW", "EXPORT", "SUBMISSION_PACKAGE", "NOTIFICATION"] as const;
/** All supported job statuses. */
export const JobStatuses = ["QUEUED", "DISPATCHED", "RUNNING", "NEEDS_REVIEW", "SUCCEEDED", "RETRYABLE_FAILURE", "FAILED", "CANCELLED"] as const;
/** Convex validator for job kind. */
export const jobKindValidator = v.union(...JobKinds.map((kind) => v.literal(kind)));
/** Convex validator for job status. */
export const jobStatusValidator = v.union(...JobStatuses.map((status) => v.literal(status)));

/** Rejects access to a job owned by another tenant without disclosing it. */
function requireJobOrganization(jobOrganizationId: string, organizationId: string): void {
  if (jobOrganizationId !== organizationId) throwNotFound("Job not found.");
}

/** Creates a job for the caller's organization, rejecting forged tenant input. */
export const createJob = mutation({
  args: { organizationId: v.string(), kind: jobKindValidator, idempotencyKey: v.string(), inputRevision: v.string(), inputHashes: v.array(v.string()), traceId: v.string(), maxAttempts: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (args.organizationId !== auth.organizationId) throwValidation("Organization does not match the authenticated tenant.");
    const existing = await ctx.db.query("jobs").withIndex("by_idempotencyKey", (query) => query.eq("idempotencyKey", args.idempotencyKey)).unique();
    if (existing !== null) {
      requireJobOrganization(existing.organizationId, auth.organizationId);
      return existing._id;
    }
    return ctx.db.insert("jobs", { organizationId: auth.organizationId, kind: args.kind, status: "QUEUED", idempotencyKey: args.idempotencyKey, inputRevision: args.inputRevision, inputHashes: args.inputHashes, attempt: 0, maxAttempts: args.maxAttempts ?? 3, traceId: args.traceId, requestedBy: auth.clerkUserId, createdAt: Date.now() });
  },
});

/** Moves a queued job to dispatched for a trusted worker. */
export const dispatchJob = internalMutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (job === null) throwNotFound("Job not found.");
    if (job.status !== "QUEUED") throwConflict("Job already dispatched.");
    await ctx.db.patch(job._id, { status: "DISPATCHED", startedAt: Date.now(), attempt: job.attempt + 1 });
    return job._id;
  },
});

/** Records progress for a job executing in a trusted worker. */
export const reportProgress = internalMutation({
  args: { jobId: v.id("jobs"), progressStage: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (job === null) throwNotFound("Job not found.");
    if (job.status !== "DISPATCHED" && job.status !== "RUNNING") throwConflict("Job not running.");
    await ctx.db.patch(job._id, { status: "RUNNING", progressStage: args.progressStage });
    return job._id;
  },
});

/** Completes a worker job only when its input provenance remains current. */
export const completeJob = internalMutation({
  args: { jobId: v.id("jobs"), inputRevision: v.string(), inputHashes: v.array(v.string()), traceId: v.string(), outputRefs: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (job === null) throwNotFound("Job not found.");
    if (job.inputRevision !== args.inputRevision || job.traceId !== args.traceId) throwConflict("Stale result: revision or trace mismatch.");
    if (job.inputHashes.length !== args.inputHashes.length || job.inputHashes.some((hash, index) => hash !== args.inputHashes[index])) throwConflict("Stale result: input hashes mismatch.");
    if (job.status === "CANCELLED" || job.status === "SUCCEEDED") throwConflict("Job already terminal.");
    await ctx.db.patch(job._id, { status: "SUCCEEDED", completedAt: Date.now(), outputRefs: args.outputRefs, progressStage: "COMPLETE" });
    return job._id;
  },
});

/** Records a trusted worker failure and determines whether it can retry. */
export const failJob = internalMutation({
  args: { jobId: v.id("jobs"), retryable: v.boolean(), safeFailureCode: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (job === null) throwNotFound("Job not found.");
    if (!/^[A-Z][A-Z0-9_]*$/.test(args.safeFailureCode)) throwValidation("Invalid safeFailureCode.");
    const status = args.retryable && job.attempt < job.maxAttempts ? "RETRYABLE_FAILURE" : "FAILED";
    await ctx.db.patch(job._id, { status, safeFailureCode: args.safeFailureCode, completedAt: status === "FAILED" ? Date.now() : undefined });
    return { status, attempt: job.attempt };
  },
});

/** Cancels a non-terminal job owned by the authenticated organization. */
export const cancelJob = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const job = await ctx.db.get(args.jobId);
    if (job === null) throwNotFound("Job not found.");
    requireJobOrganization(job.organizationId, auth.organizationId);
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job.status)) throwConflict("Cannot cancel terminal job.");
    await ctx.db.patch(job._id, { status: "CANCELLED", completedAt: Date.now() });
    return job._id;
  },
});

/** Returns a job only when the caller belongs to its organization. */
export const getJob = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const job = await ctx.db.get(args.jobId);
    if (job === null) throwNotFound("Job not found.");
    requireJobOrganization(job.organizationId, auth.organizationId);
    return job;
  },
});
