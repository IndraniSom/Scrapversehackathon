/** Runtime regression tests for tenant-bound jobs and HTTP authentication. */
import { createHash } from "node:crypto";

import { convexTest } from "convex-test";
import { Webhook } from "svix";
import { afterEach, describe, expect, test } from "vitest";

import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

/** Creates an authenticated test backend with two isolated organizations. */
async function tenantBackend() {
  const backend = convexTest(schema, modules);
  await backend.run(async (ctx) => {
    const now = Date.now();
    for (const organizationId of ["org_a", "org_b"]) {
      await ctx.db.insert("organizationProfiles", {
        organizationId,
        clerkOrganizationId: organizationId,
        slug: organizationId,
        displayName: organizationId,
        timezone: "Asia/Kolkata",
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.insert("organizationMemberships", {
      organizationId: "org_a",
      clerkOrganizationId: "org_a",
      clerkUserId: "user_a",
      role: "org:admin",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId: "org_b",
      clerkOrganizationId: "org_b",
      clerkUserId: "user_b",
      role: "org:admin",
      createdAt: now,
      updatedAt: now,
    });
  });
  return backend;
}

/** Builds Clerk-compatible identity claims for one tenant. */
function identity(userId: string, organizationId: string) {
  return { subject: userId, orgId: organizationId };
}

afterEach(() => {
  delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  delete process.env.CLERK_WEBHOOK_SECRET;
});

describe("job tenant boundary", () => {
  test("rejects caller-supplied organization different from active tenant", async () => {
    const backend = await tenantBackend();
    const caller = backend.withIdentity(identity("user_a", "org_a"));
    await expect(caller.mutation(api.jobs.createJob, {
      organizationId: "org_b",
      kind: "ASSESSMENT",
      idempotencyKey: "org-b-forgery",
      inputRevision: "1",
      inputHashes: ["a".repeat(64)],
      traceId: "trace-forgery",
    })).rejects.toThrow("Organization does not match");
  });

  test("hides another tenant job from reads and cancellation", async () => {
    const backend = await tenantBackend();
    const owner = backend.withIdentity(identity("user_a", "org_a"));
    const attacker = backend.withIdentity(identity("user_b", "org_b"));
    const jobId = await owner.mutation(api.jobs.createJob, {
      organizationId: "org_a",
      kind: "ASSESSMENT",
      idempotencyKey: "owned-job",
      inputRevision: "1",
      inputHashes: ["b".repeat(64)],
      traceId: "trace-owned",
    });
    await expect(attacker.query(api.jobs.getJob, { jobId })).rejects.toThrow("Job not found");
    await expect(attacker.mutation(api.jobs.cancelJob, { jobId })).rejects.toThrow("Job not found");
    await backend.mutation(internal.jobs.dispatchJob, { jobId });
    expect((await owner.query(api.jobs.getJob, { jobId })).status).toBe("DISPATCHED");
  });
});

describe("HTTP authentication boundary", () => {
  test("rejects Clerk webhook when signing secret is missing", async () => {
    const backend = await tenantBackend();
    const response = await backend.fetch("/clerk-webhook", {
      method: "POST",
      body: JSON.stringify({ type: "user.created", data: { id: "forged", organization_id: "org_a" } }),
    });
    expect(response.status).toBe(401);
  });

  test("rejects wrong API key and accepts matching active key", async () => {
    const backend = await tenantBackend();
    const rawKey = "bdr_test_valid_key";
    const hash = createHash("sha256").update(rawKey).digest("hex");
    await backend.run(async (ctx) => {
      await ctx.db.insert("integrationConnections", {
        organizationId: "org_a",
        provider: "api_key",
        referenceName: "test",
        scopes: [hash],
        state: "active",
        createdAt: Date.now(),
      });
    });
    expect((await backend.fetch("/exports", { headers: { "x-api-key": "wrong" } })).status).toBe(401);
    const response = await backend.fetch("/exports", { headers: { "x-api-key": rawKey } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ organizationId: "org_a" });
  });

  test("persists a valid signed Clerk membership event", async () => {
    const backend = convexTest(schema, modules);
    const secret = "whsec_C2FVsBQIhrscChlQIMV+b5sSYspob7oD";
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = secret;
    const eventId = "msg_membership_created";
    const timestamp = new Date();
    const payload = JSON.stringify({
      type: "organizationMembership.created",
      data: {
        id: "membership_a",
        role: "org:reviewer",
        public_user_data: { user_id: "user_a" },
        organization: { id: "org_a" },
      },
    });
    const response = await backend.fetch("/clerk-webhook", {
      method: "POST",
      headers: {
        "svix-id": eventId,
        "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
        "svix-signature": new Webhook(secret).sign(eventId, timestamp, payload),
      },
      body: payload,
    });
    expect(response.status).toBe(200);
    const membership = await backend.run((ctx) => ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_and_id", (query) => query.eq("organizationId", "org_a").eq("clerkUserId", "user_a"))
      .unique());
    expect(membership).toMatchObject({ organizationId: "org_a", clerkUserId: "user_a", role: "org:reviewer" });
  });
});
