/** Runtime tests for Bright Data collection orchestration. */
import { convexTest } from "convex-test";
import { createHmac } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";

import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { isAllowedDomain, isValidCollector, isValidSchedule } from "../../convex/sources";

const modules = import.meta.glob("../../convex/**/*.ts");

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete process.env.BRIGHT_DATA_API_TOKEN;
  delete process.env.BRIGHT_DATA_WEBHOOK_SECRET;
});

test("manual trigger persists provider collection id returned by Bright Data", async () => {
  process.env.BRIGHT_DATA_API_TOKEN = "test-token";
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ collection_id: "collection-live-1" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })));
  const backend = convexTest(schema, modules);
  const now = Date.now();
  const connectorId = await backend.run(async (ctx) => {
    await ctx.db.insert("organizationProfiles", {
      organizationId: "org_a", clerkOrganizationId: "org_a", slug: "org-a", displayName: "Org A", timezone: "Asia/Kolkata", createdAt: now, updatedAt: now,
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId: "org_a", clerkOrganizationId: "org_a", clerkUserId: "user_a", role: "org:admin", createdAt: now, updatedAt: now,
    });
    return ctx.db.insert("sourceConnectors", {
      organizationId: "org_a", portal: "NTPC", collectorName: "ntpc-live-tenders", collectorVersion: "1.0.0", policyReviewedAt: now, enabled: true, createdAt: now, updatedAt: now,
    });
  });
  const caller = backend.withIdentity({ subject: "user_a", orgId: "org_a" });
  const runId = await caller.mutation(api.sourceRuns.triggerCollection, { connectorId, trigger: "manual" });
  vi.useFakeTimers();
  await backend.finishAllScheduledFunctions(vi.runAllTimers);
  const run = await backend.run((ctx) => ctx.db.get(runId));
  expect(fetch).toHaveBeenCalledWith("https://api.brightdata.com/dca/trigger?collector=ntpc-live-tenders&queue_next=1", expect.objectContaining({ method: "POST" }));
  expect(run).toMatchObject({ providerRunId: "collection-live-1", status: "running" });
});

test("signed webhook stores closed records and raw snapshot", async () => {
  const backend = convexTest(schema, modules);
  const now = Date.now();
  const connectorId = await backend.run((ctx) => ctx.db.insert("sourceConnectors", {
    organizationId: "org_a", portal: "NTPC", collectorName: "ntpc-live-tenders", collectorVersion: "1.0.0", policyReviewedAt: now, enabled: true, createdAt: now, updatedAt: now,
  }));
  const body = JSON.stringify({
    connectorId,
    providerRunId: "collection-live-2",
    collectorVersion: "1.0.0",
    startedAt: now,
    completedAt: now + 100,
    digest: "c".repeat(64),
    status: "succeeded",
    records: [{ sourceTenderId: "NIT-1", title: "Secure cloud", authority: "NTPC", canonicalUrl: "https://ntpctender.ntpc.co.in/NIT/1" }],
  });
  const secret = "bright-webhook-secret";
  process.env.BRIGHT_DATA_WEBHOOK_SECRET = secret;
  const response = await backend.fetch("/brightdata/webhook", {
    method: "POST",
    headers: { "x-brightdata-signature": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}` },
    body,
  });
  expect(response.status).toBe(200);
  vi.useFakeTimers();
  await backend.finishAllScheduledFunctions(vi.runAllTimers);
  const stored = await backend.run(async (ctx) => ({
    run: await ctx.db.query("sourceRuns").withIndex("by_organization_and_id", (query) => query.eq("organizationId", "org_a").eq("providerRunId", "collection-live-2")).unique(),
    snapshots: await ctx.db.query("sourceSnapshots").withIndex("by_organization", (query) => query.eq("organizationId", "org_a")).collect(),
    opportunities: await ctx.db.query("opportunities").withIndex("by_organization", (query) => query.eq("organizationId", "org_a")).collect(),
  }));
  expect(stored.run).toMatchObject({ status: "succeeded", counters: { fetched: 1, normalized: 1 } });
  expect(stored.snapshots).toHaveLength(1);
  expect(stored.opportunities).toHaveLength(1);
  expect(stored.opportunities[0]).toMatchObject({ sourceTenderId: "NIT-1", title: "Secure cloud", dataMode: "LIVE" });
});

test("connector validators enforce source policy boundaries", () => {
  expect(isAllowedDomain("https://ntpctender.ntpc.co.in/Index/Search", "NTPC")).toBe(true);
  expect(isAllowedDomain("https://evil.example/Index/Search", "NTPC")).toBe(false);
  expect(isValidCollector("ntpc-live-tenders", "1.0.0")).toBe(true);
  expect(isValidCollector("BAD NAME", "1")).toBe(false);
  expect(isValidSchedule("0 */6 * * *")).toBe(true);
});
