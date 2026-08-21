/**
 * Source and opportunity tables.
 */
import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Connectors, runs, snapshots, opportunities and documents. */
export const sourceTables = {
  sourceConnectors: defineTable({
    organizationId: v.string(),
    portal: v.string(),
    collectorName: v.string(),
    collectorVersion: v.string(),
    scheduleCron: v.optional(v.string()),
    policyReviewedAt: v.optional(v.number()),
    enabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "portal"]),

  sourceRuns: defineTable({
    organizationId: v.string(),
    connectorId: v.id("sourceConnectors"),
    providerRunId: v.optional(v.string()),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("retryable"),
    ),
    rawSnapshotHash: v.optional(v.string()),
    counters: v.optional(v.object({ fetched: v.number(), normalized: v.number() })),
    failureCode: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "providerRunId"]),

  sourceSnapshots: defineTable({
    organizationId: v.string(),
    sourceRunId: v.id("sourceRuns"),
    storageId: v.id("_storage"),
    digest: v.string(),
    provenance: v.optional(v.object({ collectorVersion: v.string(), providerRunId: v.string() })),
    retentionUntil: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "digest"]),

  opportunities: defineTable({
    organizationId: v.string(),
    source: v.string(),
    sourceTenderId: v.string(),
    title: v.string(),
    authority: v.string(),
    referenceId: v.optional(v.string()),
    category: v.optional(v.string()),
    location: v.optional(v.string()),
    budgetAmount: v.optional(v.number()),
    budgetCurrency: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    lifecycle: v.union(v.literal("open"), v.literal("closed"), v.literal("cancelled"), v.literal("archived")),
    closesAt: v.optional(v.number()),
    canonicalUrl: v.optional(v.string()),
    dataMode: v.optional(v.union(v.literal("LIVE"), v.literal("RECORDED_BRIGHT_DATA_SNAPSHOT"), v.literal("MANUAL_FIXTURE"))),
    hasAmendment: v.optional(v.boolean()),
    assessmentRecommendation: v.optional(v.union(v.literal("BID"), v.literal("REVIEW"), v.literal("NO_BID"))),
    currentVersionId: v.optional(v.id("opportunityVersions")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "sourceTenderId"])
    .index("by_organization_source", ["organizationId", "source"])
    .index("by_organization_category", ["organizationId", "category"])
    .index("by_organization_lifecycle", ["organizationId", "lifecycle"])
    .index("by_organization_closesAt", ["organizationId", "closesAt"])
    .index("by_organization_location", ["organizationId", "location"])
    .index("by_organization_dataMode", ["organizationId", "dataMode"])
    .searchIndex("search_title", { searchField: "title", filterFields: ["organizationId", "source", "category", "lifecycle"] })
    .searchIndex("search_authority", { searchField: "authority", filterFields: ["organizationId", "source", "category", "lifecycle"] })
    .searchIndex("search_reference", { searchField: "referenceId", filterFields: ["organizationId", "source", "category", "lifecycle"] }),

  opportunityVersions: defineTable({
    organizationId: v.string(),
    opportunityId: v.id("opportunities"),
    sourceSnapshotId: v.id("sourceSnapshots"),
    contentDigest: v.string(),
    normalizedData: v.optional(v.string()),
    dataMode: v.union(v.literal("LIVE"), v.literal("RECORDED_BRIGHT_DATA_SNAPSHOT"), v.literal("MANUAL_FIXTURE")),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "opportunityId"]),

  opportunityDocuments: defineTable({
    organizationId: v.string(),
    opportunityId: v.id("opportunities"),
    opportunityVersionId: v.optional(v.id("opportunityVersions")),
    role: v.string(),
    url: v.string(),
    storageId: v.optional(v.id("_storage")),
    digest: v.optional(v.string()),
    pageCount: v.optional(v.number()),
    textQuality: v.optional(v.string()),
    authority: v.union(v.literal("official"), v.literal("unofficial")),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "opportunityId"]),

  opportunityRelationships: defineTable({
    organizationId: v.string(),
    sourceOpportunityId: v.id("opportunities"),
    targetOpportunityId: v.id("opportunities"),
    kind: v.union(
      v.literal("duplicate"),
      v.literal("reissue"),
      v.literal("corrigendum"),
      v.literal("clarification"),
      v.literal("replacement"),
    ),
    status: v.union(v.literal("candidate"), v.literal("confirmed"), v.literal("rejected")),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "sourceOpportunityId"]),
};
