/**
 * Company and evidence tables.
 */
import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Company profile and structured evidence. */
export const companyTables = {
  companies: defineTable({
    organizationId: v.string(),
    legalName: v.string(),
    registrationId: v.optional(v.string()),
    categories: v.optional(v.array(v.string())),
    locations: v.optional(v.array(v.string())),
    capabilities: v.optional(v.array(v.string())),
    status: v.union(v.literal("active"), v.literal("archived")),
    revision: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "legalName"]),

  companyTurnover: defineTable({
    organizationId: v.string(),
    companyId: v.id("companies"),
    financialYear: v.string(),
    amountInr: v.number(),
    audited: v.boolean(),
    legalEntity: v.optional(v.string()),
    evidenceDocumentId: v.optional(v.id("companyDocuments")),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "companyId"]),

  companyCertifications: defineTable({
    organizationId: v.string(),
    companyId: v.id("companies"),
    name: v.string(),
    issuer: v.string(),
    identifier: v.optional(v.string()),
    validFrom: v.optional(v.number()),
    validUntil: v.optional(v.number()),
    evidenceDocumentId: v.optional(v.id("companyDocuments")),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "companyId"]),

  companyProjects: defineTable({
    organizationId: v.string(),
    companyId: v.id("companies"),
    clientName: v.string(),
    valueInr: v.optional(v.number()),
    startAt: v.optional(v.number()),
    endAt: v.optional(v.number()),
    completionState: v.union(v.literal("completed"), v.literal("ongoing")),
    capabilityTags: v.optional(v.array(v.string())),
    evidenceDocumentId: v.optional(v.id("companyDocuments")),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "companyId"]),

  companyExemptions: defineTable({
    organizationId: v.string(),
    companyId: v.id("companies"),
    scheme: v.string(),
    qualificationState: v.union(v.literal("qualified"), v.literal("pending"), v.literal("not_qualified")),
    validUntil: v.optional(v.number()),
    evidenceDocumentId: v.optional(v.id("companyDocuments")),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "companyId"]),

  companyDocuments: defineTable({
    organizationId: v.string(),
    companyId: v.optional(v.id("companies")),
    storageId: v.id("_storage"),
    sha256: v.string(),
    mime: v.string(),
    size: v.number(),
    fileName: v.optional(v.string()),
    scanState: v.union(
      v.literal("pending"),
      v.literal("quarantined"),
      v.literal("quarantine"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("deleted"),
    ),
    classification: v.optional(v.string()),
    revision: v.number(),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "sha256"])
    .index("by_sha256", ["sha256"]),
};
