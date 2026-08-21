/** Typed tenant authorization helpers for Convex functions. */
import type { UserIdentity } from "convex/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { throwForbidden, throwUnauthorized } from "./errors";

/** Roles synchronized from Clerk organization membership claims. */
export type OrganizationRole = "org:admin" | "org:bid_manager" | "org:reviewer" | "org:contributor" | "org:viewer";
/** Context accepted by authorization helpers. */
type AuthorizationCtx = MutationCtx | QueryCtx;
/** Verified organization identity for a Convex request. */
export type AuthContext = { userId: string; clerkUserId: string; tokenIdentifier: string; issuer: string; organizationId: string; role: OrganizationRole };

/** Returns a non-empty string claim when present. */
function stringClaim(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Extracts Clerk's active organization identifier from verified JWT claims. */
function extractOrganizationId(identity: UserIdentity): string | null {
  const direct = stringClaim(identity.orgId) ?? stringClaim(identity.org_id) ?? stringClaim(identity.organizationId);
  if (direct !== null) return direct;
  const organization = identity.o;
  if (organization !== null && typeof organization === "object" && !Array.isArray(organization)) return stringClaim(organization.id);
  return identity.tokenIdentifier.match(/(org_[a-zA-Z0-9_]+)/)?.[1] ?? null;
}

/** Requires a complete authenticated Convex identity. */
export async function requireIdentity(ctx: AuthorizationCtx): Promise<Omit<AuthContext, "organizationId" | "role">> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null || !identity.subject || !identity.tokenIdentifier || !identity.issuer) throwUnauthorized("Invalid identity claims.");
  return { userId: identity.tokenIdentifier, clerkUserId: identity.subject, tokenIdentifier: identity.tokenIdentifier, issuer: identity.issuer };
}

/** Requires an active organization membership for the authenticated user. */
export async function requireOrganization(ctx: AuthorizationCtx): Promise<AuthContext> {
  const base = await requireIdentity(ctx);
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throwUnauthorized();
  const organizationId = extractOrganizationId(identity);
  if (organizationId === null) throwForbidden("Organization context required.");
  const membership = await ctx.db.query("organizationMemberships").withIndex("by_organization_and_id", (query) => query.eq("organizationId", organizationId).eq("clerkUserId", base.clerkUserId)).unique();
  if (membership === null) throwForbidden("You do not have permission for this organization.");
  const profile = await ctx.db.query("organizationProfiles").withIndex("by_clerkOrganizationId", (query) => query.eq("clerkOrganizationId", organizationId)).unique();
  if (profile === null) throwForbidden("Organization is inactive or not found.");
  return { ...base, organizationId, role: membership.role as OrganizationRole };
}

/** Requires a role or explicit permission in the caller's organization. */
export async function requirePermission(ctx: AuthorizationCtx, permission: string): Promise<AuthContext> {
  const auth = await requireOrganization(ctx);
  const membership = await ctx.db.query("organizationMemberships").withIndex("by_organization_and_id", (query) => query.eq("organizationId", auth.organizationId).eq("clerkUserId", auth.clerkUserId)).unique();
  if (membership === null) throwForbidden("You do not have permission for this organization.");
  if (membership.role === "org:admin" || membership.role === permission || membership.permissions?.includes(permission)) return auth;
  throwForbidden("Insufficient role for this action.");
}
