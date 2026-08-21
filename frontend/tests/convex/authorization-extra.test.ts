/**
 * Additional authorization tests split to keep files under 200 lines.
 */
import { describe, expect, test, vi } from "vitest";
import { ConvexError } from "convex/values";
import { requirePermission } from "../../convex/lib/authorization";

type MockIdentity = {
  tokenIdentifier: string;
  subject: string;
  issuer: string;
  orgId?: string;
  org_id?: string;
  organizationId?: string;
  o?: { id: string };
};

function createCtx(opts: {
  identity: MockIdentity | null;
  membership?: { role: string; permissions?: string[]; organizationId: string } | null;
  profile?: unknown | null;
}) {
  const { identity, membership = null, profile = { _id: "p1" } } = opts;
  return {
    auth: { getUserIdentity: vi.fn(async () => identity as unknown as ReturnType<typeof vi.fn>) },
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
  } as unknown as Parameters<typeof requirePermission>[0];
}

function expectDomainError(err: unknown, code: string) {
  expect(err).toBeInstanceOf(ConvexError);
  expect((err as ConvexError<{ code: string }>).data.code).toBe(code);
}

describe("authorization extra", () => {
  test("requirePermission uses verified role and admin bypass", async () => {
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
    await expect(requirePermission(ctx as never, "proposal:write")).rejects.toSatisfy((e: unknown) => {
      expectDomainError(e, "FORBIDDEN");
      return true;
    });
    await expect(requirePermission(ctx as never, "org:admin")).rejects.toSatisfy((e: unknown) => {
      expectDomainError(e, "FORBIDDEN");
      return true;
    });
    const adminCtx = createCtx({
      identity,
      membership: { role: "org:admin", organizationId: "org_perm" },
      profile: { _id: "p1" },
    });
    const adminOk = await requirePermission(adminCtx as never, "any:permission");
    expect(adminOk.role).toBe("org:admin");
  });
});
