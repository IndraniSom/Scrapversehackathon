/**
 * Saved search CRUD for opportunity discovery.
 *
 * Stores structured query and filter payloads per organization.
 * Every function authorizes tenant context before read or write.
 */
import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireOrganization } from "./lib/authorization";
import { throwNotFound, throwValidation } from "./lib/errors";

const filtersValidator = v.optional(
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
);

/**
 * Lists saved searches for the current organization.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const { organizationId } = await requireOrganization(ctx);
    const rows = await ctx.db
      .query("savedSearches")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();
    return rows;
  },
});

/**
 * Gets one saved search by id, tenant-scoped.
 */
export const get = query({
  args: { id: v.id("savedSearches") },
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganization(ctx);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.organizationId !== organizationId) throwNotFound();
    return doc;
  },
});

/**
 * Creates a saved search with cadence and channel preferences.
 */
export const create = mutation({
  args: {
    name: v.optional(v.string()),
    query: v.string(),
    filters: filtersValidator,
    cadence: v.union(v.literal("instant"), v.literal("daily"), v.literal("weekly")),
    channels: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const { organizationId, clerkUserId } = await requireOrganization(ctx);
    if (args.query.length > 200) throwValidation("Query too long.");
    if (args.channels.length === 0) throwValidation("At least one channel required.");
    const now = Date.now();
    const id = await ctx.db.insert("savedSearches", {
      organizationId,
      ownerId: clerkUserId,
      name: args.name,
      query: args.query,
      filters: args.filters,
      cadence: args.cadence,
      channels: args.channels,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
});

/**
 * Updates an existing saved search owned by the organization.
 */
export const update = mutation({
  args: {
    id: v.id("savedSearches"),
    name: v.optional(v.string()),
    query: v.optional(v.string()),
    filters: filtersValidator,
    cadence: v.optional(v.union(v.literal("instant"), v.literal("daily"), v.literal("weekly"))),
    channels: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganization(ctx);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.organizationId !== organizationId) throwNotFound();
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name;
    if (args.query !== undefined) {
      if (args.query.length > 200) throwValidation("Query too long.");
      patch.query = args.query;
    }
    if (args.filters !== undefined) patch.filters = args.filters;
    if (args.cadence !== undefined) patch.cadence = args.cadence;
    if (args.channels !== undefined) {
      if (args.channels.length === 0) throwValidation("At least one channel required.");
      patch.channels = args.channels;
    }
    await ctx.db.patch(args.id, patch);
    return args.id;
  },
});

/**
 * Removes a saved search.
 */
export const remove = mutation({
  args: { id: v.id("savedSearches") },
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganization(ctx);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.organizationId !== organizationId) throwNotFound();
    await ctx.db.delete(args.id);
    return null;
  },
});
