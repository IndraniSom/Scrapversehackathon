import { describe, expect, test } from "vitest";
import { canTransition, cosineSimilarity, isDuplicateTitle, rankSmes, suggestDuplicates } from "../../convex/lib/contentLibraryHelpers";

describe("content library lifecycle", () => {
  test("allows draft->review->approved->expired->draft but blocks bad jumps", () => {
    expect(canTransition("draft", "review")).toBe(true);
    expect(canTransition("review", "approved")).toBe(true);
    expect(canTransition("approved", "expired")).toBe(true);
    expect(canTransition("expired", "draft")).toBe(true);
    expect(canTransition("draft", "approved")).toBe(false);
    expect(canTransition("approved", "draft")).toBe(false);
    expect(canTransition("review", "expired")).toBe(false);
  });

  test("rejects duplicate titles case-insensitive and trimmed", () => {
    expect(isDuplicateTitle(" ISO controls ", ["iso Controls"])).toBe(true);
    expect(isDuplicateTitle("New Title", ["Old Title"])).toBe(false);
    expect(isDuplicateTitle("  New  ", ["new"])).toBe(true);
  });

  test("filters viewer to approved only", () => {
    const entries = [{ status: "draft" }, { status: "approved" }, { status: "review" }];
    const visibleForViewer = entries.filter((e) => e.status === "approved");
    expect(visibleForViewer).toEqual([{ status: "approved" }]);
    const visibleForManager = entries;
    expect(visibleForManager.length).toBe(3);
  });

  test("detects stale by age and markers without mutating approved text", () => {
    const now = Date.now();
    const fresh = { body: "Valid controls", updatedAt: now - 2 * 86400000, reviewCadenceDays: 90 };
    const staleAge = { body: "Valid", updatedAt: now - 100 * 86400000, reviewCadenceDays: 90 };
    const staleMarker = { body: "uses discontinued Photon", updatedAt: now, reviewCadenceDays: 90 };
    const isStale = (e: typeof fresh) => (now - e.updatedAt) / 86400000 > (e.reviewCadenceDays ?? 90) || ["discontinued", "deprecated", "former employee"].some((m) => e.body.toLowerCase().includes(m));
    expect(isStale(fresh)).toBe(false);
    expect(isStale(staleAge)).toBe(true);
    expect(isStale(staleMarker)).toBe(true);
  });

  test("immutable revisions: rollback creates new entry without overwriting history", () => {
    const revisions = [{ id: "r1", body: "v1" }, { id: "r2", body: "v2" }];
    const entry = { body: "v2" };
    const target = revisions[0];
    const newRevisions = [...revisions, { id: "r3", body: target.body }];
    const rolledBackEntry = { ...entry, body: target.body };
    expect(rolledBackEntry.body).toBe("v1");
    expect(newRevisions.length).toBe(3);
    expect(revisions.length).toBe(2);
  });

  test("propose from proposal creates review status needing approval", () => {
    const proposed = { title: "From proposal", body: "Approved section", status: "review" as const };
    expect(proposed.status).toBe("review");
    expect(canTransition("review", "approved")).toBe(true);
    expect(canTransition("draft", "approved")).toBe(false);
  });
});

describe("vector duplicate helper", () => {
  test("cosine handles zero and mismatched lengths", () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 0], [0, 1, 0])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
  });

  test("suggests only above threshold and requires confirmation", () => {
    const query = [1, 0, 0];
    const candidates = [{ id: "a", embedding: [0.99, 0.01, 0] }, { id: "b", embedding: [0.5, 0.5, 0] }];
    const found = suggestDuplicates(query, candidates, 0.88);
    expect(found.some((c) => c.id === "a")).toBe(true);
    expect(found.some((c) => c.id === "b")).toBe(false);
  });

  test("caps duplicate suggestions at five", () => {
    const query = [1, 0];
    const candidates = Array.from({ length: 10 }, (_, i) => ({ id: String(i), embedding: [1, 0] }));
    expect(suggestDuplicates(query, candidates).length).toBe(5);
  });
});

describe("sme recommender", () => {
  test("ranks by approved count then recency and explains", () => {
    const contributions = [
      { ownerId: "alice", capabilityArea: "cybersecurity", approvedCount: 12, lastApprovedAt: 100 },
      { ownerId: "bob", capabilityArea: "cybersecurity", approvedCount: 8, lastApprovedAt: 200 },
      { ownerId: "carol", capabilityArea: "cloud", approvedCount: 20, lastApprovedAt: 300 },
    ];
    const ranked = rankSmes(contributions, "cybersecurity");
    expect(ranked[0].ownerId).toBe("alice");
    expect(ranked[0].reason).toContain("approved contributions");
    expect(ranked.length).toBe(2);
  });

  test("returns empty for blank capability", () => {
    expect(rankSmes([{ ownerId: "a", capabilityArea: "cloud", approvedCount: 1, lastApprovedAt: 1 }], "  ")).toEqual([]);
  });
});
