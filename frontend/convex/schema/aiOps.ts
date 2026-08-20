/**
 * AI, operations, and learning tables.
 */
import { defineTable } from "convex/server";
import { v } from "convex/values";

/** AI runs, feedback, eval, integrations, webhooks, audit, outcomes. */
export const aiOpsTables = {
  aiRuns: defineTable({
    organizationId: v.string(),
    feature: v.string(),
    model: v.string(),
    promptVersion: v.string(),
    schemaVersion: v.string(),
    inputHashes: v.array(v.string()),
    tokens: v.optional(v.object({ input: v.number(), output: v.number() })),
    cost: v.optional(v.number()),
    outcome: v.union(v.literal("success"), v.literal("failure")),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "feature"]),

  aiFeedback: defineTable({
    organizationId: v.string(),
    outputId: v.string(),
    userDecision: v.union(v.literal("accepted"), v.literal("rejected"), v.literal("edited")),
    correctionCategory: v.optional(v.string()),
    acceptedRevision: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "outputId"]),

  evaluationCases: defineTable({
    organizationId: v.string(),
    datasetVersion: v.string(),
    inputRefs: v.array(v.string()),
    expectedFacts: v.optional(v.string()),
    expectedStructure: v.optional(v.string()),
    expectedOutcome: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "datasetVersion"]),

  integrationConnections: defineTable({
    organizationId: v.string(),
    provider: v.string(),
    referenceName: v.string(),
    scopes: v.optional(v.array(v.string())),
    state: v.union(v.literal("active"), v.literal("disabled")),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "provider"]),

  webhookDeliveries: defineTable({
    organizationId: v.string(),
    event: v.string(),
    destination: v.string(),
    attempt: v.number(),
    signatureId: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("delivered"), v.literal("failed")),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "event"]),

  auditEvents: defineTable({
    organizationId: v.string(),
    actorId: v.string(),
    action: v.string(),
    targetType: v.string(),
    targetId: v.string(),
    beforeDigest: v.optional(v.string()),
    afterDigest: v.optional(v.string()),
    traceId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "targetId"]),

  bidOutcomes: defineTable({
    organizationId: v.string(),
    opportunityId: v.optional(v.id("opportunities")),
    result: v.union(v.literal("won"), v.literal("lost"), v.literal("no_submit")),
    valueInr: v.optional(v.number()),
    reasonCategories: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    evidence: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "result"]),
};
