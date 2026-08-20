/**
 * Tenant authorization tests.
 *
 * Verifies unauthenticated denial, inactive org denial,
 * cross-tenant denial, insufficient role, and authorized access.
 */
import { describe, expect, test, vi } from "vitest";
import { ConvexError } from "convex/values";
import {
  requireIdentity,
  requireOrganization,
  requirePermission,
} from "../../convex/lib/authorization";

type MockIdentity = {
  tokenIdentifier: string;
  subject: string;
  issuer: string;
  // Clerk claims
  orgId?: string;
  org_id?: string;
  organizationId?: string;
  o?: { id: string };
};

/**
 * Creates a mock ctx for authorization helpers.
 */
function createCtx(opts: {
  identity: MockIdentity | null;
  membership?: { role: string; permissions?: string[]; organizationId: string } | null;
  profile?: unknown | null;
}) {
  const { identity, membership = null, profile = { _id: "p1" } } = opts;
  return {
    auth: {
      getUserIdentity: vi.fn(async () => identity as unknown as ReturnType<typeof vi.fn>),
    },
    db: {
      query: (table: string) => ({
        withIndex: () => ({
          unique: async () => {
            if (table === "organizationMemberships") return membership;
            if (table === "organizationProfiles") return profile;
            return null;
          },
        }),
      }),
    },
  } as unknown as Parameters<typeof requireIdentity>[0];
}

/**
 * Asserts the error is a ConvexError with given code.
 */
function expectDomainError(err: unknown, code: string) {
  expect(err).toBeInstanceOf(ConvexError);
  expect((err as ConvexError<{ code: string }>).data.code).toBe(code);
}

describe("authorization", () => {
  test("unauthenticated denial for requireIdentity and requireOrganization", async () => {
    const ctx = createCtx({ identity: null });
    await expect(requireIdentity(ctx)).rejects.toSatisfy((e: unknown) => {
      expectDomainError(e, "UNAUTHORIZED");
      return true;
    });
    await expect(requireOrganization(ctx)).rejects.toSatisfy((e: unknown) => {
      expectDomainError(e, "UNAUTHORIZED");
      return true;
    });
  });

  test("inactive org denial when profile missing", async () => {
    const identity: MockIdentity = {
      tokenIdentifier: "https://clerk.example|user_111",
      subject: "user_111",
      issuer: "https://clerk.example",
      orgId: "org_aaa",
    };
    const ctx = createCtx({
      identity,
      membership: { role: "org:admin", organizationId: "org_aaa" },
      profile: null,
    });
    await expect(requireOrganization(ctx)).rejects.toSatisfy((e: unknown) => {
      expectDomainError(e, "FORBIDDEN");
      return true;
    });
  });

  test("cross-tenant denial when membership for org missing", async () => {
    const identity: MockIdentity = {
      tokenIdentifier: "https://clerk.example|user_222",
      subject: "user_222",
      issuer: "https://clerk.example",
      orgId: "org_tenant_b",
    };
    // membership only for tenant_a, so query for org_tenant_b returns null
    const ctx = createCtx({
      identity,
      membership: null,
      profile: { _id: "p1" },
    });
    await expect(requireOrganization(ctx)).rejects.toSatisfy((e: unknown) => {
      expectDomainError(e, "FORBIDDEN");
      return true;
    });
  });

  test("insufficient role denial via requirePermission", async () => {
    const identity: MockIdentity = {
      tokenIdentifier: "https://clerk.example|user_333",
      subject: "user_333",
      issuer: "https://clerk.example",
      orgId: "org_tenant_c",
    };
    const ctx = createCtx({
      identity,
      membership: { role: "org:viewer", organizationId: "org_tenant_c", permissions: [] },
      profile: { _id: "p1" },
    });
    await expect(requirePermission(ctx as never, "org:admin")).rejects.toSatisfy((e: unknown) => {
      expectDomainError(e, "FORBIDDEN");
      return true;
    });
  });

  test("authorized access returns context", async () => {
    const identity: MockIdentity = {
      tokenIdentifier: "https://clerk.example|user_444",
      subject: "user_444",
      issuer: "https://clerk.example",
      orgId: "org_ok",
    };
    const ctx = createCtx({
      identity,
      membership: { role: "org:admin", organizationId: "org_ok", permissions: ["org:admin"] },
      profile: { _id: "p1", clerkOrganizationId: "org_ok" },
    });
    const orgCtx = await requireOrganization(ctx);
    expect(orgCtx.organizationId).toBe("org_ok");
    expect(orgCtx.role).toBe("org:admin");
    expect(orgCtx.clerkUserId).toBe("user_444");

    const permCtx = await requirePermission(ctx as never, "org:admin");
    expect(permCtx.organizationId).toBe("org_ok");

    // Contributor can read but not admin
    const viewerCtx = createCtx({
      identity,
      membership: { role: "org:contributor", organizationId: "org_ok" },
      profile: { _id: "p1" },
    });
    await expect(requirePermission(viewerCtx as never, "org:admin")).rejects.toSatisfy((e: unknown) => {
      expectDomainError(e, "FORBIDDEN");
      return true;
    });
    const ok = await requirePermission(viewerCtx as never, "org:contributor");
    expect(ok.role).toBe("org:contributor");
  });

  test("org extraction supports org_id, tokenIdentifier, and o.id", async () => {
    const base = {
      tokenIdentifier: "https://clerk.example|user_555|org_from_token",
      subject: "user_555",
      issuer: "https://clerk.example",
    };
    const ctxToken = createCtx({
      identity: base as MockIdentity,
      membership: { role: "org:viewer", organizationId: "org_from_token" },
      profile: { _id: "p1" },
    });
    const viaToken = await requireOrganization(ctxToken);
    expect(viaToken.organizationId).toBe("org_from_token");

    const viaOrgId: MockIdentity = { ...base, org_id: "org_via_underscore", tokenIdentifier: "https://clerk.example|user_555" };
    const ctxUnderscore = createCtx({
      identity: viaOrgId,
      membership: { role: "org:viewer", organizationId: "org_via_underscore" },
      profile: { _id: "p1" },
    });
    expect((await requireOrganization(ctxUnderscore)).organizationId).toBe("org_via_underscore");

    const viaO: MockIdentity = { ...base, tokenIdentifier: "https://clerk.example|user_555", o: { id: "org_via_o" } };
    const ctxO = createCtx({
      identity: viaO,
      membership: { role: "org:viewer", organizationId: "org_via_o" },
      profile: { _id: "p1" },
    });
    expect((await requireOrganization(ctxO)).organizationId).toBe("org_via_o");
  });

  test("requirePermission allows permission array and admin bypass", async () => {
    const identity: MockIdentity = {
      tokenIdentifier: "https://clerk.example|user_777",
      subject: "user_777",
      issuer: "https://clerk.example",
      orgId: "org_perm",
    };
    const ctx = createCtx({
      identity,
      membership: { role: "org:bid_manager", organizationId: "org_perm", permissions: ["proposal:write"] },
      profile: { _id: "p1" },
    });
    const ok = await requirePermission(ctx as never, "proposal:write");
    expect(ok.role).toBe("org:bid_manager");
    await expect(requirePermission(ctx as never, "org:admin")).rejects.toSatisfy((e: unknown) => {
      expectDomainError(e, "FORBIDDEN");
      return true;
    });
    // admin bypass
    const adminCtx = createCtx({
      identity,
      membership: { role: "org:admin", organizationId: "org_perm" },
      profile: { _id: "p1" },
    });
    const adminOk = await requirePermission(adminCtx as never, "any:permission");
    expect(adminOk.role).toBe("org:admin");
  });
});
