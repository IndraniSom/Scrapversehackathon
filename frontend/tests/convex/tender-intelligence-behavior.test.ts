/** Persistent tender-intelligence action tests. */
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

test("stores cited Q&A result for authenticated opportunity tenant", async () => {
  process.env.BIDRADAR_WORKER_BASE_URL = "https://worker.example";
  process.env.BIDRADAR_WORKER_HMAC_SECRET = "worker-secret";
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ kind: "qa", result: { question: "EMD?", paragraphs: [{ text: "EMD is INR 500000", citations: [{ chunk_id: "chunk", document_id: "doc", page_number: 2, document_hash: "a".repeat(64) }] }], abstained: false } }), { status: 200 })));
  const backend = convexTest(schema, modules);
  const now = Date.now();
  const opportunityId = await backend.run(async (ctx) => {
    await ctx.db.insert("organizationProfiles", { organizationId: "org_a", clerkOrganizationId: "org_a", slug: "org-a", displayName: "Org A", timezone: "UTC", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: "org_a", clerkOrganizationId: "org_a", clerkUserId: "user_a", role: "org:admin", createdAt: now, updatedAt: now });
    const opportunity = await ctx.db.insert("opportunities", { organizationId: "org_a", source: "NTPC", sourceTenderId: "NIT-1", title: "Cloud", authority: "NTPC", lifecycle: "open", createdAt: now, updatedAt: now });
    const document = await ctx.db.insert("opportunityDocuments", { organizationId: "org_a", opportunityId: opportunity, role: "BASE_TENDER", url: "https://ntpctender.ntpc.co.in/1", digest: "a".repeat(64), authority: "official", createdAt: now });
    await ctx.db.insert("documentChunks", { organizationId: "org_a", documentId: document, pageStart: 2, pageEnd: 2, textHash: "b".repeat(64), boundedText: "EMD is INR 500000", createdAt: now });
    return opportunity;
  });
  const caller = backend.withIdentity({ subject: "user_a", orgId: "org_a" });
  await caller.action(api.tenderIntelligence.request, { opportunityId, kind: "qa", question: "EMD?" });
  const results = await caller.query(api.tenderIntelligence.list, { opportunityId });
  expect(results).toHaveLength(1);
  expect(JSON.parse(results[0].resultJson ?? "{}")).toMatchObject({ abstained: false });
});
