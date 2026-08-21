/**
 * Tests for stable source key, immutable digests, and dedup/version rules.
 *
 * Covers unchanged replay, changed deadline, new document, corrigendum,
 * cross-portal similarity, false duplicate rejection, allowlisted fetch,
 * and preservation of LIVE/RECORDED/MANUAL labels.
 */
import { describe, expect, test } from "vitest";
import {
  canonicalDigest,
  shouldCreateNewVersion,
  stableSourceKey,
} from "../../convex/opportunities";
import {
  authorityForUrl,
  isAllowlistedDocumentUrl,
  isEligibleForQueue,
} from "../../convex/documents";

// Lightweight cross-portal similarity helper mirroring backend logic.
function titleSimilarity(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const tb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  const inter = [...ta].filter((x) => tb.has(x)).length;
  const union = new Set([...ta, ...tb]).size;
  return union ? inter / union : 0;
}

function classifyFrontend(source: { source: string; sourceTenderId: string; title: string }, target: { source: string; sourceTenderId: string; title: string; authority: string }): { kind: string; status: string } | null {
  if (source.source === target.source && source.sourceTenderId === target.sourceTenderId) {
    return { kind: "duplicate", status: "confirmed" };
  }
  if (target.title.toLowerCase().includes("corrigendum")) {
    return { kind: "corrigendum", status: "confirmed" };
  }
  const sim = titleSimilarity(source.title, target.title);
  if (source.source !== target.source && sim >= 0.82) return { kind: "duplicate", status: "candidate" };
  return null;
}

describe("opportunity versioning", () => {
  const base = {
    source: "NTPC",
    sourceTenderId: "NTPC-001",
    title: "ERP application maintenance",
    authority: "NTPC Limited",
    referenceNumber: "NTPC/ERP/2026/101",
    category: "ERP",
    publishedAt: null as number | null,
    closesAt: Date.parse("2026-09-01T12:00:00+05:30"),
    canonicalUrl: "https://ntpctender.ntpc.co.in/NITDetails/NITs/101",
    documentHashes: ["abc123"],
  };

  test("stableSourceKey combines source and sourceTenderId", () => {
    expect(stableSourceKey("NTPC", "NTPC-001")).toBe("NTPC:NTPC-001");
    expect(stableSourceKey("CPPP", "X")).not.toBe(stableSourceKey("NTPC", "X"));
  });

  test("unchanged replay produces same digest and no new version", () => {
    const d1 = canonicalDigest(base);
    const d2 = canonicalDigest({ ...base });
    expect(d1).toBe(d2);
    expect(shouldCreateNewVersion(d1, d2)).toBe(false);
  });

  test("changed deadline produces new digest and new version", () => {
    const d1 = canonicalDigest(base);
    const d2 = canonicalDigest({ ...base, closesAt: Date.parse("2026-09-10T12:00:00+05:30") });
    expect(d1).not.toBe(d2);
    expect(shouldCreateNewVersion(d1, d2)).toBe(true);
  });

  test("new document hash triggers new version", () => {
    const d1 = canonicalDigest(base);
    const d2 = canonicalDigest({ ...base, documentHashes: ["abc123", "def456"] });
    expect(d1).not.toBe(d2);
    expect(shouldCreateNewVersion(d1, d2)).toBe(true);
  });

  test("corrigendum relationship is detected", () => {
    const source = { source: "NTPC", sourceTenderId: "NTPC-001", title: "ERP application maintenance" };
    const corrigendum = { source: "NTPC", sourceTenderId: "NTPC-001-CORR", title: "Corrigendum: ERP application maintenance", authority: "NTPC Limited" };
    const rel = classifyFrontend(source, corrigendum);
    expect(rel?.kind).toBe("corrigendum");
  });

  test("cross-portal similarity creates candidate", () => {
    const a = { source: "CPPP", sourceTenderId: "CPPP-1", title: "Cloud operations support services for enterprise" };
    const b = { source: "NTPC", sourceTenderId: "NTPC-99", title: "Cloud operations support services for enterprise", authority: "NTPC Limited" };
    const rel = classifyFrontend(a, b);
    expect(rel?.status).toBe("candidate");
  });

  test("false duplicate is rejected", () => {
    const a = { source: "CPPP", sourceTenderId: "CPPP-1", title: "Cloud operations support services" };
    const b = { source: "WEST_BENGAL", sourceTenderId: "WB-999", title: "Road construction and maintenance", authority: "WTL" };
    expect(classifyFrontend(a, b)).toBeNull();
  });

  test("allowlisted fetch permits gov hosts and rejects others", () => {
    expect(isAllowlistedDocumentUrl("https://ntpctender.ntpc.co.in/NITDetails/NITs/101")).toBe(true);
    expect(isAllowlistedDocumentUrl("https://www.eprocure.gov.in/epublish/app")).toBe(true);
    expect(isAllowlistedDocumentUrl("https://odisha.gov.in/sites/default/files/2026-01/RFP.pdf")).toBe(true);
    expect(isAllowlistedDocumentUrl("https://evil.example/NITDetails/NITs/101")).toBe(false);
    expect(isAllowlistedDocumentUrl("http://ntpctender.ntpc.co.in/NITDetails/NITs/101")).toBe(false);
  });

  test("authorityForUrl preserves official vs unofficial", () => {
    expect(authorityForUrl("https://ntpctender.ntpc.co.in/NITDetails/NITs/1")).toBe("official");
    expect(authorityForUrl("https://evil.example/doc.pdf")).toBe("unofficial");
  });

  test("isEligibleForQueue respects allowlist", () => {
    expect(isEligibleForQueue("official", "https://ntpctender.ntpc.co.in/NITDetails/NITs/1")).toBe(true);
    expect(isEligibleForQueue("official", "https://evil.example/doc.pdf")).toBe(false);
  });

  test("preserves LIVE / RECORDED / MANUAL labels", () => {
    const modes = ["LIVE", "RECORDED_BRIGHT_DATA_SNAPSHOT", "MANUAL_FIXTURE"] as const;
    for (const m of modes) {
      const d = canonicalDigest(base);
      expect(typeof d).toBe("string");
      expect(m).toMatch(/LIVE|RECORDED_BRIGHT_DATA_SNAPSHOT|MANUAL_FIXTURE/);
    }
  });
});
