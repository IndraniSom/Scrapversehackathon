/** Internal-only Resend delivery for tenant notification records. */
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { throwValidation } from "./lib/errors";

/** Builds Resend idempotency key scoped to organization, event, and recipient. */
export function buildIdempotencyKey(org: string, eventId: string, recipient: string): string {
  return `${org}:${eventId}:${recipient}`;
}

/** Escapes untrusted notification text before HTML email rendering. */
export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/** Loads one pending email delivery with tenant-owned event and recipient email. */
export const loadDelivery = internalQuery({
  args: { deliveryId: v.id("notificationDeliveries") },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery || delivery.channel !== "email" || delivery.status !== "pending") throwValidation("Pending email delivery not found.");
    const event = await ctx.db.get(delivery.eventId);
    const user = await ctx.db.query("users").withIndex("by_organization_and_id", (query) => query.eq("organizationId", delivery.organizationId).eq("clerkUserId", delivery.recipientId)).unique();
    if (!event || event.organizationId !== delivery.organizationId || !user?.email) throwValidation("Email delivery input is incomplete.");
    const message = event.payload?.slice(0, 2000) || `${event.type.replaceAll("_", " ")} update for ${event.sourceEntityId}`;
    return { organizationId: delivery.organizationId, eventId: delivery.eventId, recipientId: delivery.recipientId, recipientEmail: user.email, subject: `BidRadar: ${event.type.replaceAll("_", " ")}`, html: `<p>${escapeHtml(message)}</p>` };
  },
});

/** Sends one pre-authorized email delivery without a public model/tool surface. */
export const sendEmail = internalAction({
  args: { deliveryId: v.id("notificationDeliveries") },
  handler: async (ctx, args) => {
    const input = await ctx.runQuery(internal.email.loadDelivery, args);
    const resendKey = process.env.RESEND_API_KEY;
    const from = process.env.BIDRADAR_EMAIL_FROM;
    if (!resendKey || !from) throwValidation("Email service unavailable.");
    const key = buildIdempotencyKey(input.organizationId, String(input.eventId), input.recipientId);
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify({ from, to: [input.recipientEmail], subject: input.subject, html: input.html }) });
    await ctx.runMutation(internal.email.recordSend, { deliveryId: args.deliveryId, status: response.ok ? "delivered" : "failed", providerId: response.headers.get("x-message-id") ?? undefined });
    if (!response.ok) throw new Error(`RESEND_HTTP_${response.status}`);
  },
});

/** Records provider delivery status without scanning other tenants. */
export const recordSend = internalMutation({
  args: { deliveryId: v.id("notificationDeliveries"), status: v.union(v.literal("delivered"), v.literal("failed")), providerId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throwValidation("Delivery not found.");
    await ctx.db.patch(args.deliveryId, { status: args.status, providerId: args.providerId, attempts: delivery.attempts + 1 });
  },
});
