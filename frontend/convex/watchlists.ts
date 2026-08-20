/**
 * Watchlist pipeline for opportunity pursuit.
 *
 * Stages: DISCOVERED | QUALIFYING | PURSUING | NO_BID | SUBMITTED | WON | LOST | ARCHIVED
 * Supports stage transitions, bulk watch/unwatch, and owner assignment.
 */
import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireOrganization } from "./lib/authorization";
import { throwConflict, throwNotFound } from "./lib/errors";

const stageValidator = v.union(
  v.literal("DISCOVERED"),
  v.literal("QUALIFYING"),
  v.literal("PURSUING"),
  v.literal("NO_BID"),
  v.literal("SUBMITTED"),
  v.literal("WON"),
  v.literal("LOST"),
  v.literal("ARCHIVED"),
);

/**
 * Lists watchlist entries for the organization.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const { organizationId } = await requireOrganization(ctx);
    return await ctx.db
      .query("watchlists")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();
  },
});

/**
 * Gets a single watchlist entry by opportunity.
 */
export const getByOpportunity = query({
  args: { opportunityId: v.id("opportunities") },
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganization(ctx);
    const row = await ctx.db
      .query("watchlists")
      .withIndex("by_organization_and_id", (q) =>
        q.eq("organizationId", organizationId).eq("opportunityId", args.opportunityId),
      )
      .unique();
    return row;
  },
});

/**
 * Adds an opportunity to the watchlist at DISCOVERED stage.
 */
export const add = mutation({
  args: {
    opportunityId: v.id("opportunities"),
    stage: v.optional(stageValidator),
    notes: v.optional(v.string()),
    nextActionAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { organizationId, clerkUserId } = await requireOrganization(ctx);
    const existing = await ctx.db
      .query("watchlists")
      .withIndex("by_organization_and_id", (q) =>
        q.eq("organizationId", organizationId).eq("opportunityId", args.opportunityId),
      )
      .unique();
    if (existing) throwConflict("Already in watchlist.");
    const opp = await ctx.db.get(args.opportunityId);
    if (!opp || opp.organizationId !== organizationId) throwNotFound();
    const id = await ctx.db.insert("watchlists", {
      organizationId,
      opportunityId: args.opportunityId,
      ownerId: clerkUserId,
      stage: args.stage ?? "DISCOVERED",
      notes: args.notes,
      nextActionAt: args.nextActionAt,
      createdAt: Date.now(),
    });
    return id;
  },
});

/**
 * Updates stage, notes, or next action for a watchlist entry.
 */
export const update = mutation({
  args: {
    id: v.id("watchlists"),
    stage: v.optional(stageValidator),
    notes: v.optional(v.string()),
    nextActionAt: v.optional(v.number()),
    ownerId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganization(ctx);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.organizationId !== organizationId) throwNotFound();
    const patch: Record<string, unknown> = {};
    if (args.stage !== undefined) patch.stage = args.stage;
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.nextActionAt !== undefined) patch.nextActionAt = args.nextActionAt;
    if (args.ownerId !== undefined) patch.ownerId = args.ownerId;
    await ctx.db.patch(args.id, patch);
    return args.id;
  },
});

/**
 * Removes one watchlist entry.
 */
export const remove = mutation({
  args: { id: v.id("watchlists") },
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganization(ctx);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.organizationId !== organizationId) throwNotFound();
    await ctx.db.delete(args.id);
    return null;
  },
});

/**
 * Bulk add opportunities to watchlist. Skips already-watched ids.
 */
export const bulkWatch = mutation({
  args: { opportunityIds: v.array(v.id("opportunities")), stage: v.optional(stageValidator) },
  handler: async (ctx, args) => {
    const { organizationId, clerkUserId } = await requireOrganization(ctx);
    let added = 0;
    for (const oid of args.opportunityIds) {
      const existing = await ctx.db
        .query("watchlists")
        .withIndex("by_organization_and_id", (q) => q.eq("organizationId", organizationId).eq("opportunityId", oid))
        .unique();
      if (existing) continue;
      const opp = await ctx.db.get(oid);
      if (!opp || opp.organizationId !== organizationId) continue;
      await ctx.db.insert("watchlists", {
        organizationId,
        opportunityId: oid,
        ownerId: clerkUserId,
        stage: args.stage ?? "DISCOVERED",
        createdAt: Date.now(),
      });
      added += 1;
    }
    return { added };
  },
});

/**
 * Bulk remove opportunities from watchlist by opportunity ids.
 */
export const bulkUnwatch = mutation({
  args: { opportunityIds: v.array(v.id("opportunities")) },
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganization(ctx);
    let removed = 0;
    for (const oid of args.opportunityIds) {
      const existing = await ctx.db
        .query("watchlists")
        .withIndex("by_organization_and_id", (q) => q.eq("organizationId", organizationId).eq("opportunityId", oid))
        .unique();
      if (!existing) continue;
      await ctx.db.delete(existing._id);
      removed += 1;
    }
    return { removed };
  },
});
