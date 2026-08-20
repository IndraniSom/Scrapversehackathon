/**
 * Extraction, review, and assessment tables.
 */
import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Document pages, chunks, embeddings, requirements, reviews, assessments. */
export const extractionTables = {
  documentPages: defineTable({
    organizationId: v.string(),
    documentId: v.id("opportunityDocuments"),
    pageNumber: v.number(),
    printedLabel: v.optional(v.string()),
    textHash: v.string(),
    storageRef: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "documentId"]),

  documentChunks: defineTable({
    organizationId: v.string(),
    documentId: v.id("opportunityDocuments"),
    pageStart: v.number(),
    pageEnd: v.number(),
    heading: v.optional(v.string()),
    textHash: v.string(),
    boundedText: v.string(),
    embeddingId: v.optional(v.id("chunkEmbeddings")),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "documentId"]),

  chunkEmbeddings: defineTable({
    organizationId: v.string(),
    documentId: v.string(),
    chunkId: v.id("documentChunks"),
    contentKind: v.string(),
    language: v.string(),
    embedding: v.array(v.float64()),
    modelRevision: v.string(),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "chunkId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 768,
      filterFields: ["organizationId", "documentId", "contentKind", "language"],
    }),

  requirementSets: defineTable({
    organizationId: v.string(),
    documentId: v.id("opportunityDocuments"),
    revision: v.number(),
    extractionState: v.union(v.literal("pending"), v.literal("extracted"), v.literal("failed")),
    reviewState: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    schemaVersion: v.string(),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "documentId"]),

  requirements: defineTable({
    organizationId: v.string(),
    requirementSetId: v.id("requirementSets"),
    predicate: v.object({ field: v.string(), operator: v.string(), expected: v.optional(v.string()) }),
    hardness: v.union(v.literal("hard"), v.literal("soft")),
    applicability: v.optional(v.object({ field: v.string(), operator: v.string() })),
    evidenceSpans: v.optional(v.array(v.object({ page: v.number(), text: v.string() }))),
    revision: v.number(),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "requirementSetId"]),

  reviewTasks: defineTable({
    organizationId: v.string(),
    targetType: v.string(),
    targetId: v.string(),
    assigneeId: v.optional(v.string()),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    dueAt: v.optional(v.number()),
    state: v.union(v.literal("open"), v.literal("in_review"), v.literal("approved"), v.literal("rejected")),
    decision: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "targetId"])
    .index("by_organization_assignee_state_dueAt", ["organizationId", "assigneeId", "state", "dueAt"]),

  assessments: defineTable({
    organizationId: v.string(),
    companyId: v.id("companies"),
    opportunityId: v.id("opportunities"),
    requirementSetRevision: v.number(),
    recommendation: v.union(v.literal("BID"), v.literal("REVIEW"), v.literal("NO_BID")),
    counts: v.object({ pass: v.number(), fail: v.number(), unknown: v.number() }),
    asOf: v.number(),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "companyId"]),

  ruleResults: defineTable({
    organizationId: v.string(),
    assessmentId: v.id("assessments"),
    ruleId: v.string(),
    evaluation: v.union(v.literal("PASS"), v.literal("FAIL"), v.literal("UNKNOWN"), v.literal("NOT_APPLICABLE")),
    values: v.optional(v.object({ actual: v.optional(v.string()), expected: v.optional(v.string()) })),
    explanation: v.optional(v.string()),
    evidence: v.optional(v.array(v.string())),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "assessmentId"]),

  amendmentImpacts: defineTable({
    organizationId: v.string(),
    opportunityId: v.id("opportunities"),
    authorityStatement: v.string(),
    oldRule: v.optional(v.string()),
    newRule: v.optional(v.string()),
    transition: v.string(),
    applied: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "opportunityId"]),
};
