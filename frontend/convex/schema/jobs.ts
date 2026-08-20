/**
 * Jobs table for cross-service durable work.
 */
import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Generic job queue used by worker and workflow orchestration. */
export const jobTables = {
  jobs: defineTable({
    organizationId: v.string(),
    kind: v.union(
      v.literal("SOURCE_COLLECTION"),
      v.literal("DOCUMENT_PARSE"),
      v.literal("DOCUMENT_OCR"),
      v.literal("REQUIREMENT_EXTRACTION"),
      v.literal("EMBEDDING"),
      v.literal("ASSESSMENT"),
      v.literal("AMENDMENT_DIFF"),
      v.literal("TENDER_BRIEF"),
      v.literal("TENDER_QA"),
      v.literal("COMPLIANCE_MATRIX"),
      v.literal("PROPOSAL_OUTLINE"),
      v.literal("PROPOSAL_DRAFT"),
      v.literal("CLAIM_REVIEW"),
      v.literal("EXPORT"),
      v.literal("SUBMISSION_PACKAGE"),
      v.literal("NOTIFICATION"),
    ),
    status: v.union(
      v.literal("QUEUED"),
      v.literal("DISPATCHED"),
      v.literal("RUNNING"),
      v.literal("NEEDS_REVIEW"),
      v.literal("SUCCEEDED"),
      v.literal("RETRYABLE_FAILURE"),
      v.literal("FAILED"),
      v.literal("CANCELLED"),
    ),
    idempotencyKey: v.string(),
    inputRevision: v.string(),
    inputHashes: v.array(v.string()),
    attempt: v.number(),
    maxAttempts: v.number(),
    progressStage: v.optional(v.string()),
    safeFailureCode: v.optional(v.string()),
    outputRefs: v.optional(v.array(v.string())),
    requestedBy: v.string(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    traceId: v.string(),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_organization_status_kind_createdAt", ["organizationId", "status", "kind", "createdAt"])
    .index("by_organization_and_id", ["organizationId", "idempotencyKey"]),
};
