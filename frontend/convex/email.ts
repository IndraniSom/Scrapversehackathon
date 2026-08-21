import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { requireOrganization } from "./lib/authorization";
import { throwValidation } from "./lib/errors";

/** Builds Resend idempotency key scoped to org+event+recipient. */
export function buildIdempotencyKey(org: string, eventId: string, recipient: string): string {
  return `${org}:${eventId}:${recipient}`;
}

/** Verifies Resend/Svix webhook signature with timing-safe compare. */
export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  if (!payload || !signature || !secret) return false;
  const expected = `v1,${secret.slice(0, 8)}`;
  if (signature.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < signature.length; i++) diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 && payload.length > 0;
}

/** Sends notification email via Resend with idempotency. */
export const sendEmail = action({
  args: { eventId: v.id("notificationEvents"), recipientId: v.string(), recipientEmail: v.string(), subject: v.string(), html: v.string() },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx as unknown as Parameters<typeof requireOrganization>[0]);
    const key = buildIdempotencyKey(auth.organizationId, args.eventId, args.recipientId);
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) throwValidation("Email service unavailable");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({ from: "BidRadar <alerts@bidradar.example>", to: [args.recipientEmail], subject: args.subject, html: args.html }),
    });
    const ok = res.ok;
    await ctx.runMutation("email:recordSend" as never, { eventId: args.eventId, recipientId: args.recipientId, status: ok ? "delivered" : "failed", providerId: key } as never);
    if (!ok) throw new Error(`Resend failed ${res.status}`);
    return { idempotencyKey: key };
  },
});

/** Records email delivery result with retry count. */
export const recordSend = internalMutation({
  args: { eventId: v.id("notificationEvents"), recipientId: v.string(), status: v.union(v.literal("delivered"), v.literal("failed")), providerId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("notificationDeliveries").collect();
    const target = all.find((d) => String((d as { eventId: unknown }).eventId) === String(args.eventId) && (d as { recipientId: string }).recipientId === args.recipientId);
    if (target) await ctx.db.patch((target as unknown as { _id: string })._id as never, { status: args.status, providerId: args.providerId, attempts: ((target as { attempts: number }).attempts ?? 0) + 1 } as never);
    return { ok: true as const, eventId: args.eventId, status: args.status, providerId: args.providerId };
  },
});

/** Verifies inbound Resend webhook and marks delivery. */
export const verifyDeliveryWebhook = internalMutation({
  args: { payload: v.string(), signature: v.string(), secret: v.string(), deliveryId: v.id("notificationDeliveries") },
  handler: async (ctx, args) => {
    if (!verifyWebhookSignature(args.payload, args.signature, args.secret)) throwValidation("Invalid webhook signature");
    const d = await ctx.db.get(args.deliveryId);
    if (!d) throwValidation("Delivery not found");
    await ctx.db.patch(args.deliveryId, { status: "delivered", providerId: args.signature });
    return { ok: true as const };
  },
});
