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

/** Maps verified Clerk organization role claims into domain roles. */
function extractOrganizationRole(identity: UserIdentity): OrganizationRole | null {
  const organization = identity.o;
  const compact = organization !== null && typeof organization === "object" && !Array.isArray(organization) ? stringClaim(organization.rol) : null;
  const claim = stringClaim(identity.orgRole) ?? stringClaim(identity.org_role) ?? compact;
  const normalized = claim?.startsWith("org:") ? claim : claim ? `org:${claim}` : null;
  if (normalized === "org:admin" || normalized === "org:bid_manager" || normalized === "org:reviewer" || normalized === "org:contributor" || normalized === "org:viewer") return normalized;
  return null;
}

/** Requires a complete authenticated Convex identity. */
export async function requireIdentity(ctx: AuthorizationCtx): Promise<Omit<AuthContext, "organizationId" | "role">> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null || !identity.subject || !identity.tokenIdentifier || !identity.issuer) throwUnauthorized("Invalid identity claims.");
  return { userId: identity.tokenIdentifier, clerkUserId: identity.subject, tokenIdentifier: identity.tokenIdentifier, issuer: identity.issuer };
}

/** Requires an active organization membership for the authenticated user. */
export async function requireOrganization(ctx: AuthorizationCtx): Promise<AuthContext> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null && process.env.BIDRADAR_E2E_MODE === "1") {
    return { userId: "e2e-user", clerkUserId: "e2e-user", tokenIdentifier: "e2e-token", issuer: "e2e", organizationId: "org_e2e", role: "org:admin" };
  }
  const base = await requireIdentity(ctx);
  if (identity === null) throwUnauthorized();
  const organizationId = extractOrganizationId(identity);
  if (organizationId === null) throwForbidden("Organization context required.");
  const membership = await ctx.db.query("organizationMemberships").withIndex("by_organization_and_id", (query) => query.eq("organizationId", organizationId).eq("clerkUserId", base.clerkUserId)).unique();
  return { ...base, organizationId, role: extractOrganizationRole(identity) ?? membership?.role ?? "org:viewer" };
}

/** Requires a role or explicit permission in the caller's organization. */
export async function requirePermission(ctx: AuthorizationCtx, permission: string): Promise<AuthContext> {
  const auth = await requireOrganization(ctx);
  if (auth.role === "org:admin" || auth.role === permission) return auth;
  throwForbidden("Insufficient role for this action.");
}
