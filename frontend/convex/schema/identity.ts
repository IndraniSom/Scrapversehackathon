/**
 * Identity and tenancy tables.
 */
import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Tables for users, organization profiles, and memberships. */
export const identityTables = {
  users: defineTable({
    organizationId: v.string(),
    clerkUserId: v.string(),
    displayName: v.optional(v.string()),
    email: v.optional(v.string()),
    lifecycle: v.union(v.literal("active"), v.literal("invited"), v.literal("deactivated")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_organization_and_id", ["organizationId", "clerkUserId"]),

  organizationProfiles: defineTable({
    organizationId: v.string(),
    clerkOrganizationId: v.string(),
    slug: v.string(),
    displayName: v.string(),
    locale: v.optional(v.string()),
    timezone: v.string(),
    retentionPolicy: v.optional(v.object({ snapshotsDays: v.number(), artifactsDays: v.number() })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_clerkOrganizationId", ["clerkOrganizationId"])
    .index("by_organization_and_id", ["organizationId", "clerkOrganizationId"]),

  organizationMemberships: defineTable({
    organizationId: v.string(),
    clerkUserId: v.string(),
    clerkOrganizationId: v.string(),
    role: v.union(
      v.literal("org:admin"),
      v.literal("org:bid_manager"),
      v.literal("org:reviewer"),
      v.literal("org:contributor"),
      v.literal("org:viewer"),
    ),
    permissions: v.optional(v.array(v.string())),
    webhookRevision: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "clerkUserId"])
    .index("by_clerkUserId", ["clerkUserId"]),
};
