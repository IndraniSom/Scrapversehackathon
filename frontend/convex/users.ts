/**
 * User synchronization and profile queries.
 *
 * Webhook handlers provide idempotent sync via eventId and
 * public queries enforce tenant authorization.
 */
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireOrganization } from "./lib/authorization";

/**
 * Idempotent webhook sync for Clerk user.created / user.updated.
 *
 * Deduplicates by webhookDeliveries signatureId, then upserts by clerkUserId.
 *
 * @param clerkUserId - Clerk user identifier.
 * @param organizationId - Fallback organization for new users.
 * @param eventId - Svix delivery id for idempotency.
 */
export const internalSyncUser = internalMutation({
  args: {
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    organizationId: v.string(),
    eventId: v.string(),
  },
  handler: async (ctx, args): Promise<{ duplicate: boolean }> => {
    const existingDelivery = await ctx.db
      .query("webhookDeliveries")
      .filter((q) => q.eq(q.field("signatureId"), args.eventId))
      .first();
    if (existingDelivery !== null) return { duplicate: true };
    const byClerk = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    const now = Date.now();
    if (byClerk !== null) {
      await ctx.db.patch(byClerk._id, {
        email: args.email ?? byClerk.email,
        displayName: args.displayName ?? byClerk.displayName,
        organizationId: args.organizationId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("users", {
        clerkUserId: args.clerkUserId,
        email: args.email,
        displayName: args.displayName,
        organizationId: args.organizationId,
        lifecycle: "active",
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.insert("webhookDeliveries", {
      organizationId: args.organizationId,
      event: args.eventId,
      destination: "clerk-webhook-users",
      attempt: 1,
      signatureId: args.eventId,
      status: "delivered",
      createdAt: now,
    });
    return { duplicate: false };
  },
});

/**
 * Idempotent webhook handler for Clerk user.deleted.
 *
 * Marks the user as deactivated when present.
 *
 * @param clerkUserId - Clerk user identifier.
 * @param eventId - Delivery id for idempotency.
 */
export const internalDeleteUser = internalMutation({
  args: {
    clerkUserId: v.string(),
    eventId: v.string(),
  },
  handler: async (ctx, args): Promise<{ duplicate: boolean }> => {
    const existingDelivery = await ctx.db
      .query("webhookDeliveries")
      .filter((q) => q.eq(q.field("signatureId"), args.eventId))
      .first();
    if (existingDelivery !== null) return { duplicate: true };
    const byClerk = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (byClerk !== null) {
      await ctx.db.patch(byClerk._id, { lifecycle: "deactivated", updatedAt: Date.now() });
    }
    await ctx.db.insert("webhookDeliveries", {
      organizationId: byClerk?.organizationId ?? "org_stub",
      event: args.eventId,
      destination: "clerk-webhook-users",
      attempt: 1,
      signatureId: args.eventId,
      status: "delivered",
      createdAt: Date.now(),
    });
    return { duplicate: false };
  },
});

/**
 * Returns the current authenticated user's profile.
 *
 * @returns Current user or null when not found.
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrganization(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_organization_and_id", (q) =>
        q.eq("organizationId", auth.organizationId).eq("clerkUserId", auth.clerkUserId),
      )
      .unique();
    if (user === null) return null;
    return {
      _id: user._id,
      clerkUserId: user.clerkUserId,
      email: user.email,
      displayName: user.displayName,
      lifecycle: user.lifecycle,
    };
  },
});

/**
 * Lists users in the current organization.
 *
 * @returns Users scoped to the caller's organization.
 */
export const listOrganizationUsers = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrganization(ctx);
    const users = await ctx.db
      .query("users")
      .withIndex("by_organization", (q) => q.eq("organizationId", auth.organizationId))
      .collect();
    return users.map((u) => ({
      _id: u._id,
      clerkUserId: u.clerkUserId,
      displayName: u.displayName,
      email: u.email,
      lifecycle: u.lifecycle,
    }));
  },
});
