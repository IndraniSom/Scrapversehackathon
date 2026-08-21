"use node";

/** Clerk JWT reverification boundary for sensitive submission actions. */
import { createRemoteJWKSet, jwtVerify } from "jose";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { throwForbidden, throwValidation } from "./lib/errors";

export type VerifiedActor = { organizationId: string; userId: string; role: "org:admin" | "org:bid_manager" | "org:reviewer" | "org:contributor" | "org:viewer" };

/** Narrows unknown JWT claims to non-array objects. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Maps compact or legacy Clerk role claim to one domain role. */
function roleClaim(value: unknown): VerifiedActor["role"] {
  const text = typeof value === "string" ? value : "viewer";
  const role = text.startsWith("org:") ? text : `org:${text}`;
  if (role === "org:admin" || role === "org:bid_manager" || role === "org:reviewer" || role === "org:contributor" || role === "org:viewer") return role;
  return "org:viewer";
}

/** Verifies Clerk signature, issuer, origin, active organization, and recent factor age. */
async function verifiedActor(token: string): Promise<VerifiedActor> {
  const issuer = process.env.CLERK_JWT_ISSUER_DOMAIN;
  if (!issuer) throwValidation("Clerk issuer is not configured.");
  const { payload } = await jwtVerify(token, createRemoteJWKSet(new URL(`${issuer.replace(/\/$/, "")}/.well-known/jwks.json`)), { issuer });
  const expectedOrigin = process.env.BIDRADAR_FRONTEND_ORIGIN;
  if (!expectedOrigin) throwValidation("Frontend origin is not configured.");
  if (payload.azp !== expectedOrigin) throwForbidden("Authorized party mismatch.");
  return actorFromClaims(payload);
}

/** Validates recent human and active-organization claims from verified Clerk JWT. */
export function actorFromClaims(payload: Record<string, unknown>): VerifiedActor {
  if (typeof payload.sub !== "string" || typeof payload.sid !== "string" || payload.sub.startsWith("ai_")) throwForbidden("Human Clerk session required.");
  const factors = payload.fva;
  if (!Array.isArray(factors) || typeof factors[0] !== "number" || factors[0] < 0 || factors[0] > 10) throwForbidden("Recent authentication required.");
  const organization = isRecord(payload.o) ? payload.o : null;
  const organizationId = typeof organization?.id === "string" ? organization.id : typeof payload.org_id === "string" ? payload.org_id : null;
  if (!organizationId) throwForbidden("Active organization required.");
  return { organizationId, userId: payload.sub, role: roleClaim(organization?.rol ?? payload.org_role) };
}

/** Prepares one approved package after independently verified Clerk reverification. */
export const prepareHandoff = action({
  args: { sessionToken: v.string(), packageId: v.id("submissionPackages"), portal: v.string(), officialUrl: v.string(), serverClockAcknowledged: v.boolean(), emdVerified: v.boolean(), signingVerified: v.boolean(), filenamesVerified: v.boolean(), packageDigest: v.string() },
  handler: async (ctx, args): Promise<{ prepared: boolean; digest: string }> => {
    const actor = await verifiedActor(args.sessionToken);
    return ctx.runMutation(internal.submissions.prepareHandoff, { ...actor, packageId: args.packageId, portal: args.portal, officialUrl: args.officialUrl, serverClockAcknowledged: args.serverClockAcknowledged, emdVerified: args.emdVerified, signingVerified: args.signingVerified, filenamesVerified: args.filenamesVerified, packageDigest: args.packageDigest });
  },
});

/** Records one portal receipt after independently verified Clerk reverification. */
export const recordReceipt = action({
  args: { sessionToken: v.string(), packageId: v.id("submissionPackages"), portal: v.string(), acknowledgement: v.string(), portalTimestamp: v.number(), packageDigest: v.string(), evidenceDigest: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ receiptId: Id<"submissionReceipts">; acknowledgement: string; digest: string }> => {
    const actor = await verifiedActor(args.sessionToken);
    return ctx.runMutation(internal.submissions.recordReceipt, { ...actor, packageId: args.packageId, portal: args.portal, acknowledgement: args.acknowledgement, portalTimestamp: args.portalTimestamp, packageDigest: args.packageDigest, evidenceDigest: args.evidenceDigest });
  },
});
