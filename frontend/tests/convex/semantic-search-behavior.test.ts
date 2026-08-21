/** Runtime semantic-search tests with worker embeddings and tenant vector filters. */
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.BIDRADAR_WORKER_BASE_URL;
  delete process.env.BIDRADAR_WORKER_HMAC_SECRET;
});

test("returns only active tenant semantic matches using worker embedding", async () => {
  process.env.BIDRADAR_WORKER_BASE_URL = "https://worker.example";
  process.env.BIDRADAR_WORKER_HMAC_SECRET = "worker-secret";
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ embedding: [1, ...Array(767).fill(0)], modelRevision: "e5-test" }), { status: 200 })));
  const backend = convexTest(schema, modules);
  const now = Date.now();
  await backend.run(async (ctx) => {
    for (const org of ["org_a", "org_b"]) {
      await ctx.db.insert("organizationProfiles", { organizationId: org, clerkOrganizationId: org, slug: org, displayName: org, timezone: "UTC", createdAt: now, updatedAt: now });
    }
    await ctx.db.insert("organizationMemberships", { organizationId: "org_a", clerkOrganizationId: "org_a", clerkUserId: "user_a", role: "org:admin", createdAt: now, updatedAt: now });
    for (const [org, suffix] of [["org_a", "A"], ["org_b", "B"]] as const) {
      const opportunityId = await ctx.db.insert("opportunities", { organizationId: org, source: "NTPC", sourceTenderId: `NIT-${suffix}`, title: `Cloud ${suffix}`, authority: "NTPC", lifecycle: "open", createdAt: now, updatedAt: now });
      const documentId = await ctx.db.insert("opportunityDocuments", { organizationId: org, opportunityId, role: "BASE_TENDER", url: `https://ntpctender.ntpc.co.in/${suffix}`, authority: "official", createdAt: now });
      const chunkId = await ctx.db.insert("documentChunks", { organizationId: org, documentId, pageStart: 1, pageEnd: 1, textHash: suffix.toLowerCase().repeat(64), boundedText: `secure cloud services ${suffix}`, createdAt: now });
      const embeddingId = await ctx.db.insert("chunkEmbeddings", { organizationId: org, documentId, chunkId, contentKind: "tender", language: "en", embedding: [1, ...Array(767).fill(0)], modelRevision: "e5-test", createdAt: now });
      await ctx.db.patch(chunkId, { embeddingId });
    }
  });
  const caller = backend.withIdentity({ subject: "user_a", orgId: "org_a" });
  const result = await caller.action(api.semanticSearch.semanticSearch, { query: "secure cloud", filters: {}, limit: 10 });
  expect(fetch).toHaveBeenCalledWith("https://worker.example/internal/v1/embeddings", expect.objectContaining({ method: "POST" }));
  expect(result.items).toHaveLength(1);
  expect(result.items[0]).toMatchObject({ title: "Cloud A", authority: "NTPC" });
});
