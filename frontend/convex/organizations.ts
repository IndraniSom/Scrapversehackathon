/**
 * Organization profile, members, and Clerk webhook sync.
 *
 * Public reads/writes enforce tenant authorization. Webhook handlers
 * provide idempotent organization and membership synchronization.
 */
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireOrganization, requirePermission } from "./lib/authorization";

/** Checks webhookDeliveries for duplicate eventId. */
async function isDuplicate(
  ctx: MutationCtx,
  eventId: string,
): Promise<boolean> {
  const existing = await ctx.db
    .query("webhookDeliveries")
    .filter((q) =>
      q.eq(q.field("signatureId"), eventId))
    .first();
  return existing !== null;
}

/** Idempotent sync for organization.created / updated. */
export const internalSyncOrganization = internalMutation({
  args: { clerkOrganizationId: v.string(), slug: v.string(), displayName: v.string(), eventId: v.string() },
  handler: async (ctx, args) => {
    if (await isDuplicate(ctx, args.eventId)) return { duplicate: true };
    const existing = await ctx.db.query("organizationProfiles").withIndex("by_clerkOrganizationId", (q) => q.eq("clerkOrganizationId", args.clerkOrganizationId)).unique();
    const now = Date.now();
    if (existing !== null) await ctx.db.patch(existing._id, { slug: args.slug, displayName: args.displayName, updatedAt: now });
    else await ctx.db.insert("organizationProfiles", { organizationId: args.clerkOrganizationId, clerkOrganizationId: args.clerkOrganizationId, slug: args.slug, displayName: args.displayName, timezone: "UTC", createdAt: now, updatedAt: now });
    await ctx.db.insert("webhookDeliveries", { organizationId: args.clerkOrganizationId, event: args.eventId, destination: "clerk-webhook-orgs", attempt: 1, signatureId: args.eventId, status: "delivered", createdAt: now });
    return { duplicate: false };
  },
});

/** Idempotent organization.deleted handler. */
export const internalDeleteOrganization = internalMutation({
  args: { clerkOrganizationId: v.string(), eventId: v.string() },
  handler: async (ctx, args) => {
    if (await isDuplicate(ctx, args.eventId)) return { duplicate: true };
    const existing = await ctx.db.query("organizationProfiles").withIndex("by_clerkOrganizationId", (q) => q.eq("clerkOrganizationId", args.clerkOrganizationId)).unique();
    if (existing !== null) await ctx.db.delete(existing._id);
    await ctx.db.insert("webhookDeliveries", { organizationId: args.clerkOrganizationId, event: args.eventId, destination: "clerk-webhook-orgs", attempt: 1, signatureId: args.eventId, status: "delivered", createdAt: Date.now() });
    return { duplicate: false };
  },
});

/** Idempotent membership created/updated sync. */
export const internalSyncMembership = internalMutation({
  args: { clerkUserId: v.string(), clerkOrganizationId: v.string(), role: v.string(), eventId: v.string() },
  handler: async (ctx, args) => {
    if (await isDuplicate(ctx, args.eventId)) return { duplicate: true };
    const allowed = ["org:admin", "org:bid_manager", "org:reviewer", "org:contributor", "org:viewer"] as const;
    const role = (allowed as readonly string[]).includes(args.role) ? (args.role as (typeof allowed)[number]) : "org:viewer";
    const existing = await ctx.db.query("organizationMemberships").withIndex("by_organization_and_id", (q) => q.eq("organizationId", args.clerkOrganizationId).eq("clerkUserId", args.clerkUserId)).unique();
    const now = Date.now();
    if (existing !== null) await ctx.db.patch(existing._id, { role, updatedAt: now });
    else await ctx.db.insert("organizationMemberships", { organizationId: args.clerkOrganizationId, clerkOrganizationId: args.clerkOrganizationId, clerkUserId: args.clerkUserId, role, createdAt: now, updatedAt: now });
    await ctx.db.insert("webhookDeliveries", { organizationId: args.clerkOrganizationId, event: args.eventId, destination: "clerk-webhook-memberships", attempt: 1, signatureId: args.eventId, status: "delivered", createdAt: now });
    return { duplicate: false };
  },
});

/** Idempotent membership.deleted handler. */
export const internalDeleteMembership = internalMutation({
  args: { clerkUserId: v.string(), clerkOrganizationId: v.string(), eventId: v.string() },
  handler: async (ctx, args) => {
    if (await isDuplicate(ctx, args.eventId)) return { duplicate: true };
    const existing = await ctx.db.query("organizationMemberships").withIndex("by_organization_and_id", (q) => q.eq("organizationId", args.clerkOrganizationId).eq("clerkUserId", args.clerkUserId)).unique();
    if (existing !== null) await ctx.db.delete(existing._id);
    await ctx.db.insert("webhookDeliveries", { organizationId: args.clerkOrganizationId, event: args.eventId, destination: "clerk-webhook-memberships", attempt: 1, signatureId: args.eventId, status: "delivered", createdAt: Date.now() });
    return { duplicate: false };
  },
});

/** Returns caller's organization profile. */
export const getOrganization = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrganization(ctx);
    const profile = await ctx.db.query("organizationProfiles").withIndex("by_clerkOrganizationId", (q) => q.eq("clerkOrganizationId", auth.organizationId)).unique();
    if (profile === null) return null;
    return { _id: profile._id, organizationId: profile.organizationId, clerkOrganizationId: profile.clerkOrganizationId, slug: profile.slug, displayName: profile.displayName, timezone: profile.timezone, locale: profile.locale };
  },
});

/** Lists members of the current organization. */
export const listMembers = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrganization(ctx);
    const members = await ctx.db.query("organizationMemberships").withIndex("by_organization", (q) => q.eq("organizationId", auth.organizationId)).collect();
    return members.map((m) => ({ clerkUserId: m.clerkUserId, role: m.role, permissions: m.permissions ?? [] }));
  },
});

/** Updates organization settings. Requires org:admin. */
export const updateOrganization = mutation({
  args: { displayName: v.optional(v.string()), slug: v.optional(v.string()), timezone: v.optional(v.string()), locale: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await requirePermission(ctx, "org:admin");
    const profile = await ctx.db.query("organizationProfiles").withIndex("by_clerkOrganizationId", (q) => q.eq("clerkOrganizationId", auth.organizationId)).unique();
    const identity = await ctx.auth.getUserIdentity();
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.displayName !== undefined) patch["displayName"] = args.displayName;
    if (args.slug !== undefined) patch["slug"] = args.slug;
    if (args.timezone !== undefined) patch["timezone"] = args.timezone;
    if (args.locale !== undefined) patch["locale"] = args.locale;
    if (profile) await ctx.db.patch(profile._id, patch);
    else await ctx.db.insert("organizationProfiles", { organizationId: auth.organizationId, clerkOrganizationId: auth.organizationId, slug: args.slug?.trim() || auth.organizationId, displayName: args.displayName?.trim() || "Organization", timezone: args.timezone || "UTC", locale: args.locale, createdAt: Date.now(), updatedAt: Date.now() });
    const membership = await ctx.db.query("organizationMemberships").withIndex("by_organization_and_id", (q) => q.eq("organizationId", auth.organizationId).eq("clerkUserId", auth.clerkUserId)).unique();
    if (!membership) await ctx.db.insert("organizationMemberships", { organizationId: auth.organizationId, clerkOrganizationId: auth.organizationId, clerkUserId: auth.clerkUserId, role: auth.role, createdAt: Date.now(), updatedAt: Date.now() });
    const user = await ctx.db.query("users").withIndex("by_organization_and_id", (q) => q.eq("organizationId", auth.organizationId).eq("clerkUserId", auth.clerkUserId)).unique();
    if (!user) await ctx.db.insert("users", { organizationId: auth.organizationId, clerkUserId: auth.clerkUserId, email: typeof identity?.email === "string" ? identity.email : undefined, lifecycle: "active", createdAt: Date.now(), updatedAt: Date.now() });
    return { ok: true as const };
  },
});
