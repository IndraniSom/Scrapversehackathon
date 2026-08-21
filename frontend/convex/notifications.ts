import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireOrganization } from "./lib/authorization";
import { throwConflict, throwValidation } from "./lib/errors";
import { buildDeduplicationKey, groupIntoDigest, shouldRetry, type Channel, type NotificationType } from "./notificationLogic";
export { buildDeduplicationKey, groupIntoDigest, isQuietHour, shouldDeliver, shouldRetry } from "./notificationLogic";

/** Typed event kinds; tenant dedup by org:type:source. */
export const NOTIFICATION_TYPES = [
  "saved_search_match",
  "new_document",
  "amendment",
  "deadline",
  "assessment_transition",
  "assignment",
  "comment_mention",
  "approval",
  "export",
  "submission_risk",
] as const;
const typeValidator = v.union(
  v.literal("saved_search_match"),
  v.literal("new_document"),
  v.literal("amendment"),
  v.literal("deadline"),
  v.literal("assessment_transition"),
  v.literal("assignment"),
  v.literal("comment_mention"),
  v.literal("approval"),
  v.literal("export"),
  v.literal("submission_risk"),
);

/** Emits typed event with dedup and channel fanout per recipient. */
export const emitEvent = mutation({
  args: {
    type: typeValidator,
    sourceEntityId: v.string(),
    urgency: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    payload: v.optional(v.string()),
    channels: v.optional(v.array(v.union(v.literal("in_app"), v.literal("email"), v.literal("digest")))),
    recipientIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (!args.sourceEntityId.trim()) throwValidation("sourceEntityId required");
    const key = buildDeduplicationKey(auth.organizationId, args.type as NotificationType, args.sourceEntityId);
    const existing = await ctx.db.query("notificationEvents").withIndex("by_deduplicationKey", (q) => q.eq("deduplicationKey", key)).unique();
    if (existing && existing.organizationId === auth.organizationId) throwConflict("Duplicate notification event");
    const now = Date.now();
    const eventId = await ctx.db.insert("notificationEvents", {
      organizationId: auth.organizationId,
      type: args.type,
      deduplicationKey: key,
      sourceEntityId: args.sourceEntityId,
      urgency: args.urgency,
      payload: args.payload,
      createdAt: now,
    });
    const channels: Channel[] = args.channels ?? ["in_app"];
    const recipients = args.recipientIds ?? [auth.clerkUserId];
    if (recipients.length === 0 || recipients.length > 100) throwValidation("Recipient count must be between 1 and 100.");
    for (const recipientId of recipients) {
      const membership = await ctx.db.query("organizationMemberships").withIndex("by_organization_and_id", (query) => query.eq("organizationId", auth.organizationId).eq("clerkUserId", recipientId)).unique();
      if (!membership) throwValidation("Notification recipient is not an organization member.");
    }
    for (const recipientId of recipients) for (const channel of channels) {
      const deliveryId = await ctx.db.insert("notificationDeliveries", { organizationId: auth.organizationId, eventId, channel, recipientId, attempts: 0, status: "pending", createdAt: now });
      if (channel === "email") await ctx.scheduler.runAfter(0, internal.email.sendEmail, { deliveryId });
    }
    return { eventId, deduplicationKey: key };
  },
});

/** Lists recent notification events for the organization. */
export const listEvents = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const a = await requireOrganization(ctx);
    const l = Math.min(args.limit ?? 20, 100);
    return ctx.db.query("notificationEvents").withIndex("by_organization", (q) => q.eq("organizationId", a.organizationId)).order("desc").take(l);
  },
});

/** Lists deliveries for the current recipient with optional status filter. */
export const listDeliveries = query({
  args: { status: v.optional(v.union(v.literal("pending"), v.literal("delivered"), v.literal("failed"))) },
  handler: async (ctx, args) => {
    const a = await requireOrganization(ctx);
    const all = await ctx.db.query("notificationDeliveries").withIndex("by_organization_recipient_status_createdAt", (qb) => qb.eq("organizationId", a.organizationId).eq("recipientId", a.clerkUserId)).collect();
    return args.status ? all.filter((d) => d.status === args.status) : all;
  },
});

/** Retries a failed delivery when attempts remain. */
export const retryDelivery = mutation({
  args: { deliveryId: v.id("notificationDeliveries") },
  handler: async (ctx, args) => {
    const a = await requireOrganization(ctx);
    const d = await ctx.db.get(args.deliveryId);
    if (!d || d.organizationId !== a.organizationId) throwValidation("Delivery not found");
    if (!shouldRetry(d.attempts, d.status)) throwConflict("Retry not allowed");
    await ctx.db.patch(args.deliveryId, { attempts: d.attempts + 1, status: "pending" });
    return { ok: true as const };
  },
});

/** Returns digest groups for the last 50 events. */
export const getDigest = query({
  args: {},
  handler: async (ctx) => {
    const a = await requireOrganization(ctx);
    const e = await ctx.db.query("notificationEvents").withIndex("by_organization", (q) => q.eq("organizationId", a.organizationId)).order("desc").take(50);
    const g = groupIntoDigest(e as { type: NotificationType; createdAt: number }[]);
    return Array.from(g.entries()).map(([key, items]) => ({ key, count: items.length, items }));
  },
});

/** Returns current user's persisted delivery preferences or safe defaults. */
export const getPreferences = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrganization(ctx);
    return (await ctx.db.query("notificationPreferences").withIndex("by_organization_and_id", (query) => query.eq("organizationId", auth.organizationId).eq("userId", auth.clerkUserId)).unique()) ?? {
      organizationId: auth.organizationId,
      userId: auth.clerkUserId,
      quietStartHour: 22,
      quietEndHour: 7,
      timezone: "Asia/Kolkata",
      digestCadence: "daily" as const,
      channels: ["in_app", "digest"] as Channel[],
      updatedAt: 0,
    };
  },
});

/** Creates or updates current user's bounded notification preferences. */
export const updatePreferences = mutation({
  args: {
    quietStartHour: v.number(),
    quietEndHour: v.number(),
    timezone: v.string(),
    digestCadence: v.union(v.literal("instant"), v.literal("daily"), v.literal("weekly")),
    channels: v.array(v.union(v.literal("in_app"), v.literal("email"), v.literal("digest"))),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (![args.quietStartHour, args.quietEndHour].every((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23)) throwValidation("Quiet hours must be integers from 0 to 23.");
    if (!args.timezone.trim() || args.channels.length === 0) throwValidation("Timezone and at least one channel are required.");
    const existing = await ctx.db.query("notificationPreferences").withIndex("by_organization_and_id", (query) => query.eq("organizationId", auth.organizationId).eq("userId", auth.clerkUserId)).unique();
    const value = { ...args, timezone: args.timezone.trim(), organizationId: auth.organizationId, userId: auth.clerkUserId, updatedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, value);
    else await ctx.db.insert("notificationPreferences", value);
    return { saved: true as const };
  },
});

/** Internal update for delivery status from worker or webhook. */
export const internalUpdateDelivery = internalMutation({
  args: { deliveryId: v.id("notificationDeliveries"), status: v.union(v.literal("delivered"), v.literal("failed")), providerId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const d = await ctx.db.get(args.deliveryId);
    if (!d) return null;
    await ctx.db.patch(args.deliveryId, { status: args.status, providerId: args.providerId, attempts: d.attempts + 1 });
    return { ok: true as const };
  },
});
