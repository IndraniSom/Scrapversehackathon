/**
 * Tenant authorization helpers for Convex.
 *
 * Every public Convex function must authorize the calling user, their
 * active organization, and any requested permission before reading or
 * writing tenant data.
 */
import type { GenericDatabaseReader } from "convex/server";
import type { UserIdentity } from "convex/server";
import type { DataModel } from "../_generated/dataModel";
import { throwForbidden, throwUnauthorized } from "./errors";

/**
 * Allowed organization roles synchronized from Clerk.
 */
export type OrganizationRole =
  | "org:admin"
  | "org:bid_manager"
  | "org:reviewer"
  | "org:contributor"
  | "org:viewer";

/**
 * Minimal context shape for auth helpers.
 *
 * Uses unknown for db to accept both real Convex contexts and
 * lightweight test mocks while keeping strict typing internally.
 */
export type AuthCtx = {
  auth: {
    getUserIdentity: () => Promise<UserIdentity | null>;
  };
  db: unknown;
};

/**
 * Verified tenant context returned by successful checks.
 */
export type AuthContext = {
  /** Convex token identifier for the user. */
  userId: string;
  /** Clerk user identifier (subject). */
  clerkUserId: string;
  /** Raw token identifier from the JWT. */
  tokenIdentifier: string;
  /** JWT issuer domain. */
  issuer: string;
  /** Active organization identifier. */
  organizationId: string;
  /** Resolved organization role. */
  role: OrganizationRole;
};

/**
 * Extracts organizationId from Clerk JWT claims.
 *
 * Checks orgId, org_id, organizationId, o.id, and tokenIdentifier.
 *
 * @param identity - Verified Clerk identity.
 * @returns Organization id or null when not present.
 */
function extractOrganizationId(identity: UserIdentity): string | null {
  const claims = identity as unknown as Record<string, unknown>;
  const direct =
    (typeof claims["orgId"] === "string" ? (claims["orgId"] as string) : null) ??
    (typeof claims["org_id"] === "string" ? (claims["org_id"] as string) : null) ??
    (typeof claims["organizationId"] === "string"
      ? (claims["organizationId"] as string)
      : null);
  if (direct !== null && direct.length > 0) return direct;
  const orgObject = claims["o"] as Record<string, unknown> | undefined;
  if (
    orgObject !== undefined &&
    typeof orgObject["id"] === "string" &&
    (orgObject["id"] as string).length > 0
  ) {
    return orgObject["id"] as string;
  }
  const token = identity.tokenIdentifier ?? "";
  const match = token.match(/(org_[a-zA-Z0-9_]+)/);
  return match !== null ? match[1] : null;
}

/**
 * Requires a valid authenticated identity.
 *
 * @param ctx - Convex context with auth.
 * @returns Verified identity fields.
 * @throws DomainError with UNAUTHORIZED when missing or invalid.
 */
export async function requireIdentity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
): Promise<{
  userId: string;
  clerkUserId: string;
  tokenIdentifier: string;
  issuer: string;
}> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throwUnauthorized();
  if (!identity.subject || !identity.tokenIdentifier || !identity.issuer) {
    throwUnauthorized("Invalid identity claims.");
  }
  return {
    userId: identity.tokenIdentifier,
    clerkUserId: identity.subject,
    tokenIdentifier: identity.tokenIdentifier,
    issuer: identity.issuer,
  };
}

/**
 * Requires an authenticated user within an active organization.
 *
 * Validates organization membership and that the organization profile
 * exists (active).
 *
 * @param ctx - Convex context with auth and db.
 * @returns Verified tenant context including organization and role.
 * @throws DomainError with UNAUTHORIZED or FORBIDDEN.
 */
export async function requireOrganization(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
): Promise<AuthContext> {
  const base = await requireIdentity(ctx);
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throwUnauthorized();
  const organizationId = extractOrganizationId(identity);
  if (organizationId === null) throwForbidden("Organization context required.");
  const db = ctx.db as GenericDatabaseReader<DataModel>;
  const membership = (await db
    .query("organizationMemberships")
    .withIndex("by_organization_and_id", (q) =>
      q.eq("organizationId", organizationId).eq("clerkUserId", base.clerkUserId),
    )
    .unique()) as {
    role: OrganizationRole;
    organizationId: string;
    permissions?: string[];
  } | null;
  if (membership === null) {
    throwForbidden("You do not have permission for this organization.");
  }
  const profile = await db
    .query("organizationProfiles")
    .withIndex("by_clerkOrganizationId", (q) =>
      q.eq("clerkOrganizationId", organizationId),
    )
    .unique();
  if (profile === null) throwForbidden("Organization is inactive or not found.");
  return {
    userId: base.userId,
    clerkUserId: base.clerkUserId,
    tokenIdentifier: base.tokenIdentifier,
    issuer: base.issuer,
    organizationId,
    role: membership.role,
  };
}

/**
 * Requires a specific role or permission within the organization.
 *
 * `org:admin` bypasses permission checks. Step-up authentication is
 * required for organization deletion, final proposal lock, and
 * submission-package approval (handled at the route layer).
 *
 * @param ctx - Convex context.
 * @param permission - Required role or permission string.
 * @returns Verified tenant context when authorized.
 * @throws DomainError with FORBIDDEN when insufficient.
 */
export async function requirePermission(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  permission: string,
): Promise<AuthContext> {
  const orgCtx = await requireOrganization(ctx);
  const db = ctx.db as GenericDatabaseReader<DataModel>;
  const membership = (await db
    .query("organizationMemberships")
    .withIndex("by_organization_and_id", (q) =>
      q.eq("organizationId", orgCtx.organizationId).eq("clerkUserId", orgCtx.clerkUserId),
    )
    .unique()) as { role: string; permissions?: string[] } | null;
  const role: string = membership?.role ?? orgCtx.role;
  const perms: string[] = membership?.permissions ?? [];
  if (role === "org:admin") return orgCtx;
  if (role === permission) return orgCtx;
  if (perms.includes(permission)) return orgCtx;
  throwForbidden("Insufficient role for this action.");
}
