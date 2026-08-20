import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireOrganization } from "./lib/authorization";
import { throwConflict, throwValidation } from "./lib/errors";

/** Typed event kinds; tenant dedup by org:type:source. */
export const NOTIFICATION_TYPES = [
  "saved_search_match","new_document","amendment","deadline","assessment_transition","assignment","comment_mention","approval","export","submission_risk",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type Channel = "in_app" | "email" | "digest";
export function buildDeduplicationKey(o: string, t: NotificationType, s: string): string { return `${o}:${t}:${s}`; }
export function isQuietHour(n: number, q: { startHour: number; endHour: number } | null): boolean { if (!q) return false; const h = new Date(n).getUTCHours(); return q.startHour <= q.endHour ? h >= q.startHour && h < q.endHour : h >= q.startHour || h < q.endHour; }
export function shouldDeliver(c: Channel, p: Channel[] | null, d: boolean): boolean { if (d) return false; if (p === null) return true; return p.includes(c); }
export function groupIntoDigest(e: { type: NotificationType; createdAt: number }[]): Map<string, typeof e> { const m = new Map<string, typeof e>(); for (const ev of e) { const k = `${new Date(ev.createdAt).toISOString().slice(0, 10)}:${ev.type}`; const b = m.get(k) ?? []; b.push(ev); m.set(k, b); } return m; }
export function shouldRetry(a: number, s: string): boolean { return s === "failed" && a < 3; }

const typeValidator = v.union(v.literal("saved_search_match"),v.literal("new_document"),v.literal("amendment"),v.literal("deadline"),v.literal("assessment_transition"),v.literal("assignment"),v.literal("comment_mention"),v.literal("approval"),v.literal("export"),v.literal("submission_risk"));

/** Emits typed event with dedup and channel fanout. */
export const emitEvent = mutation({
  args: { type: typeValidator, sourceEntityId: v.string(), urgency: v.union(v.literal("low"),v.literal("medium"),v.literal("high")), payload: v.optional(v.string()), channels: v.optional(v.array(v.union(v.literal("in_app"),v.literal("email"),v.literal("digest")))), recipientIds: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (!args.sourceEntityId.trim()) throwValidation("sourceEntityId required");
    const key = buildDeduplicationKey(auth.organizationId, args.type as NotificationType, args.sourceEntityId);
    const existing = await ctx.db.query("notificationEvents").withIndex("by_deduplicationKey", (q) => q.eq("deduplicationKey", key)).unique();
    if (existing && existing.organizationId === auth.organizationId) throwConflict("Duplicate notification event");
    const now = Date.now();
    const eventId = await ctx.db.insert("notificationEvents", { organizationId: auth.organizationId, type: args.type, deduplicationKey: key, sourceEntityId: args.sourceEntityId, urgency: args.urgency, payload: args.payload, createdAt: now });
    const channels: Channel[] = (args.channels as Channel[]) ?? ["in_app"];
    const recipients = args.recipientIds ?? [auth.clerkUserId];
    for (const r of recipients) for (const ch of channels) await ctx.db.insert("notificationDeliveries", { organizationId: auth.organizationId, eventId, channel: ch, recipientId: r, attempts: 0, status: "pending", createdAt: now });
    return { eventId, deduplicationKey: key };
  },
});
export const listEvents = query({ args: { limit: v.optional(v.number()) }, handler: async (ctx, args) => { const a = await requireOrganization(ctx); const l = Math.min(args.limit ?? 20, 100); return ctx.db.query("notificationEvents").withIndex("by_organization", (q) => q.eq("organizationId", a.organizationId)).order("desc").take(l); } });
export const listDeliveries = query({ args: { status: v.optional(v.union(v.literal("pending"),v.literal("delivered"),v.literal("failed"))) }, handler: async (ctx, args) => { const a = await requireOrganization(ctx); const all = await ctx.db.query("notificationDeliveries").withIndex("by_organization_recipient_status_createdAt", (qb) => qb.eq("organizationId", a.organizationId).eq("recipientId", a.clerkUserId)).collect(); return args.status ? all.filter((d) => d.status === args.status) : all; } });
export const retryDelivery = mutation({ args: { deliveryId: v.id("notificationDeliveries") }, handler: async (ctx, args) => { const a = await requireOrganization(ctx); const d = await ctx.db.get(args.deliveryId); if (!d || d.organizationId !== a.organizationId) throwValidation("Delivery not found"); if (!shouldRetry(d.attempts, d.status)) throwConflict("Retry not allowed"); await ctx.db.patch(args.deliveryId, { attempts: d.attempts + 1, status: "pending" }); return { ok: true as const }; } });
export const getDigest = query({ args: {}, handler: async (ctx) => { const a = await requireOrganization(ctx); const e = await ctx.db.query("notificationEvents").withIndex("by_organization", (q) => q.eq("organizationId", a.organizationId)).order("desc").take(50); const g = groupIntoDigest(e as { type: NotificationType; createdAt: number }[]); return Array.from(g.entries()).map(([key, items]) => ({ key, count: items.length, items })); } });
export const internalUpdateDelivery = internalMutation({ args: { deliveryId: v.id("notificationDeliveries"), status: v.union(v.literal("delivered"),v.literal("failed")), providerId: v.optional(v.string()) }, handler: async (ctx, args) => { const d = await ctx.db.get(args.deliveryId); if (!d) return null; await ctx.db.patch(args.deliveryId, { status: args.status, providerId: args.providerId, attempts: d.attempts + 1 }); return { ok: true as const }; } });
