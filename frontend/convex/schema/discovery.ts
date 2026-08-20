/**
 * Discovery and alert tables.
 */
import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Saved searches, watchlists, notification events and deliveries. */
export const discoveryTables = {
  savedSearches: defineTable({
    organizationId: v.string(),
    ownerId: v.string(),
    name: v.optional(v.string()),
    query: v.string(),
    filters: v.optional(
      v.object({
        source: v.optional(v.string()),
        authority: v.optional(v.string()),
        category: v.optional(v.string()),
        location: v.optional(v.string()),
        budgetMin: v.optional(v.number()),
        budgetMax: v.optional(v.number()),
        closesAfter: v.optional(v.number()),
        closesBefore: v.optional(v.number()),
        publishedAfter: v.optional(v.number()),
        publishedBefore: v.optional(v.number()),
        lifecycle: v.optional(v.string()),
        dataMode: v.optional(v.string()),
        hasAmendment: v.optional(v.boolean()),
        assessment: v.optional(v.string()),
      }),
    ),
    cadence: v.union(v.literal("instant"), v.literal("daily"), v.literal("weekly")),
    channels: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "ownerId"]),

  watchlists: defineTable({
    organizationId: v.string(),
    opportunityId: v.id("opportunities"),
    ownerId: v.string(),
    stage: v.union(
      v.literal("DISCOVERED"),
      v.literal("QUALIFYING"),
      v.literal("PURSUING"),
      v.literal("NO_BID"),
      v.literal("SUBMITTED"),
      v.literal("WON"),
      v.literal("LOST"),
      v.literal("ARCHIVED"),
    ),
    notes: v.optional(v.string()),
    nextActionAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "opportunityId"]),

  notificationEvents: defineTable({
    organizationId: v.string(),
    type: v.string(),
    deduplicationKey: v.string(),
    sourceEntityId: v.string(),
    urgency: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    payload: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "deduplicationKey"])
    .index("by_deduplicationKey", ["deduplicationKey"])
    .index("by_organization_recipient_status_createdAt", ["organizationId", "type", "createdAt"]),

  notificationDeliveries: defineTable({
    organizationId: v.string(),
    eventId: v.id("notificationEvents"),
    channel: v.union(v.literal("in_app"), v.literal("email"), v.literal("digest")),
    recipientId: v.string(),
    providerId: v.optional(v.string()),
    attempts: v.number(),
    status: v.union(v.literal("pending"), v.literal("delivered"), v.literal("failed")),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_id", ["organizationId", "eventId"])
    .index("by_organization_recipient_status_createdAt", ["organizationId", "recipientId", "status", "createdAt"]),
};
