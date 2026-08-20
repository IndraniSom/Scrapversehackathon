/**
 * Proposal and submission tables.
 */
import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Content library, proposals, compliance, approvals, exports, submissions. */
export const proposalTables = {
  contentEntries: defineTable({
    organizationId: v.string(),
    title: v.string(),
    body: v.string(),
    tags: v.optional(v.array(v.string())),
    evidenceId: v.optional(v.string()),
    ownerId: v.string(),
    freshnessState: v.union(v.literal("fresh"), v.literal("stale"), v.literal("expired")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "ownerId"]),

  contentEntryRevisions: defineTable({
    organizationId: v.string(),
    entryId: v.id("contentEntries"),
    body: v.string(),
    evidence: v.optional(v.string()),
    status: v.string(),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "entryId"]),

  proposalProjects: defineTable({
    organizationId: v.string(),
    opportunityId: v.id("opportunities"),
    companyId: v.id("companies"),
    stage: v.string(),
    ownerId: v.string(),
    lockedRevision: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "opportunityId"]),

  proposalSections: defineTable({
    organizationId: v.string(),
    proposalId: v.id("proposalProjects"),
    parentId: v.optional(v.id("proposalSections")),
    title: v.string(),
    instructionCitation: v.optional(v.string()),
    assigneeId: v.optional(v.string()),
    body: v.optional(v.string()),
    state: v.union(
      v.literal("NOT_STARTED"),
      v.literal("DRAFTING"),
      v.literal("READY_FOR_REVIEW"),
      v.literal("CHANGES_REQUESTED"),
      v.literal("APPROVED"),
      v.literal("LOCKED"),
    ),
    order: v.number(),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "proposalId"]),

  proposalComments: defineTable({
    organizationId: v.string(),
    proposalId: v.id("proposalProjects"),
    sectionId: v.optional(v.id("proposalSections")),
    authorId: v.string(),
    anchor: v.optional(v.string()),
    body: v.string(),
    resolutionState: v.union(v.literal("open"), v.literal("resolved")),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "proposalId"]),

  complianceRows: defineTable({
    organizationId: v.string(),
    proposalId: v.id("proposalProjects"),
    requirementId: v.id("requirements"),
    responseLocation: v.optional(v.string()),
    evidence: v.optional(v.string()),
    ownerId: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("compliant"), v.literal("gap")),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "proposalId"]),

  approvalGates: defineTable({
    organizationId: v.string(),
    targetType: v.string(),
    targetId: v.string(),
    requiredRole: v.string(),
    approverId: v.optional(v.string()),
    decision: v.optional(v.union(v.literal("approved"), v.literal("rejected"))),
    decidedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "targetId"]),

  exportJobs: defineTable({
    organizationId: v.string(),
    format: v.union(v.literal("pdf"), v.literal("docx"), v.literal("csv"), v.literal("json"), v.literal("zip")),
    template: v.optional(v.string()),
    sourceRevision: v.number(),
    outputDigest: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "format"]),

  submissionPackages: defineTable({
    organizationId: v.string(),
    proposalId: v.id("proposalProjects"),
    exportIds: v.array(v.id("exportJobs")),
    manifest: v.optional(v.string()),
    validationState: v.union(v.literal("pending"), v.literal("valid"), v.literal("invalid")),
    approvalState: v.union(v.literal("draft"), v.literal("approved"), v.literal("rejected")),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "proposalId"]),

  submissionReceipts: defineTable({
    organizationId: v.string(),
    packageId: v.id("submissionPackages"),
    portal: v.string(),
    acknowledgement: v.string(),
    submittedAt: v.number(),
    submittedBy: v.string(),
    evidenceStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "packageId"]),
};
