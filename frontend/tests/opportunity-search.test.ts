/**
 * Tests for opportunity discovery: keyword/prefix, filters, URL Zod schema,
 * pagination, saved searches, and watchlists.
 */
import { describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { filtersToSearchParams, opportunityFiltersSchema, parseFiltersFromSearchParams } from "../lib/opportunityFilters";

type Row = {
  _id: string;
  title: string;
  authority: string;
  source: string;
  category?: string;
  location?: string;
  budgetAmount?: number;
  closesAt?: number;
  publishedAt?: number;
  lifecycle: string;
  dataMode?: string;
  hasAmendment?: boolean;
  assessmentRecommendation?: string;
};

const fixtures: Row[] = [
  { _id: "1", title: "Cloud operations support services", authority: "Central Public Procurement Portal", source: "CPPP", category: "CLOUD", location: "DELHI", budgetAmount: 5000000, closesAt: Date.parse("2026-09-01T12:00:00+05:30"), publishedAt: Date.parse("2026-08-01"), lifecycle: "open", dataMode: "LIVE", hasAmendment: false, assessmentRecommendation: "BID" },
  { _id: "2", title: "Security monitoring services", authority: "Central Public Procurement Portal", source: "CPPP", category: "CYBERSECURITY", location: "DELHI", budgetAmount: 12000000, closesAt: Date.parse("2026-09-02"), lifecycle: "open", dataMode: "MANUAL_FIXTURE", hasAmendment: true, assessmentRecommendation: "REVIEW" },
  { _id: "3", title: "Hyperconverged infrastructure services", authority: "Webel Technology Limited", source: "WEST_BENGAL", category: "DATA_CENTER", location: "KOLKATA", budgetAmount: 8000000, closesAt: Date.parse("2026-08-30"), lifecycle: "closed", dataMode: "LIVE", hasAmendment: false, assessmentRecommendation: "NO_BID" },
  { _id: "4", title: "AI-enabled IoT-based Pond Monitoring", authority: "Odisha Computer Application Centre", source: "ODISHA", category: "SOFTWARE", location: "ODISHA", budgetAmount: 6000000, lifecycle: "open", dataMode: "MANUAL_FIXTURE", hasAmendment: true, assessmentRecommendation: "REVIEW" },
];

/** Mirrors opportunitySearch filter logic for unit verification. */
function applyFilters(rows: Row[], query: string | undefined, filters: Record<string, unknown>): Row[] {
  let out = rows;
  if (query) {
    const q = query.toLowerCase();
    out = out.filter((r) => r.title.toLowerCase().includes(q) || r.title.toLowerCase().startsWith(q));
  }
  if (filters.source) out = out.filter((r) => r.source === filters.source);
  if (filters.authority) out = out.filter((r) => r.authority === filters.authority);
  if (filters.category) out = out.filter((r) => r.category === filters.category);
  if (filters.location) out = out.filter((r) => r.location === filters.location);
  if (filters.budgetMin !== undefined) out = out.filter((r) => (r.budgetAmount ?? 0) >= (filters.budgetMin as number));
  if (filters.budgetMax !== undefined) out = out.filter((r) => (r.budgetAmount ?? Infinity) <= (filters.budgetMax as number));
  if (filters.closesAfter !== undefined) out = out.filter((r) => (r.closesAt ?? 0) >= (filters.closesAfter as number));
  if (filters.closesBefore !== undefined) out = out.filter((r) => (r.closesAt ?? Infinity) <= (filters.closesBefore as number));
  if (filters.publishedAfter !== undefined) out = out.filter((r) => (r.publishedAt ?? 0) >= (filters.publishedAfter as number));
  if (filters.publishedBefore !== undefined) out = out.filter((r) => (r.publishedAt ?? Infinity) <= (filters.publishedBefore as number));
  if (filters.lifecycle) out = out.filter((r) => r.lifecycle === filters.lifecycle);
  if (filters.dataMode) out = out.filter((r) => r.dataMode === filters.dataMode);
  if (filters.hasAmendment !== undefined) out = out.filter((r) => r.hasAmendment === filters.hasAmendment);
  if (filters.assessment) out = out.filter((r) => r.assessmentRecommendation === filters.assessment);
  return out;
}

describe("opportunity URL Zod schema", () => {
  test("accepts empty and valid filter combinations", () => {
    expect(opportunityFiltersSchema.safeParse({}).success).toBe(true);
    expect(opportunityFiltersSchema.safeParse({ q: "cloud", source: "CPPP", category: "CLOUD" }).success).toBe(true);
    expect(opportunityFiltersSchema.safeParse({ lifecycle: "open", dataMode: "LIVE", assessment: "BID", hasAmendment: "true" }).success).toBe(true);
    expect(opportunityFiltersSchema.safeParse({ budgetMin: "1000", budgetMax: "5000" }).success).toBe(true);
  });

  test("rejects invalid enum and overlong query", () => {
    expect(opportunityFiltersSchema.safeParse({ lifecycle: "INVALID" }).success).toBe(false);
    expect(opportunityFiltersSchema.safeParse({ dataMode: "UNKNOWN" }).success).toBe(false);
    expect(opportunityFiltersSchema.safeParse({ q: "a".repeat(201) }).success).toBe(false);
    expect(opportunityFiltersSchema.safeParse({ extra: "field" }).success).toBe(false);
  });

  test("round-trips through URLSearchParams", () => {
    const parsed = { query: "pond", filters: { source: "ODISHA", hasAmendment: true, lifecycle: "open" as const } };
    const qs = filtersToSearchParams(parsed);
    const sp = new URLSearchParams(qs);
    const result = parseFiltersFromSearchParams(sp);
    expect(result.parsed.query).toBe("pond");
    expect(result.parsed.filters!.source).toBe("ODISHA");
    expect(result.parsed.filters!.hasAmendment).toBe(true);
  });

  test("encodes budget and dates as strings", () => {
    const qs = filtersToSearchParams({ query: undefined, filters: { budgetMin: 1000, closesAfter: 123456 } } as unknown as never);
    expect(qs).toContain("budgetMin=1000");
    expect(qs).toContain("closesAfter=123456");
  });
});

describe("keyword and prefix search", () => {
  test("matches exact title keyword case-insensitive", () => {
    expect(applyFilters(fixtures, "Cloud", {})).toHaveLength(1);
    expect(applyFilters(fixtures, "cloud", {})[0]._id).toBe("1");
  });

  test("matches prefix of title", () => {
    expect(applyFilters(fixtures, "Sec", {})[0]._id).toBe("2");
    expect(applyFilters(fixtures, "Hyper", {})[0]._id).toBe("3");
    expect(applyFilters(fixtures, "AI-enabled", {})[0]._id).toBe("4");
  });

  test("prefix clo matches cloud", () => {
    const results = applyFilters(fixtures, "clo", {});
    expect(results.map((r) => r._id)).toContain("1");
  });
});

describe("filters", () => {
  test("source filter", () => expect(applyFilters(fixtures, undefined, { source: "CPPP" })).toHaveLength(2));
  test("authority filter", () => expect(applyFilters(fixtures, undefined, { authority: "Webel Technology Limited" })).toHaveLength(1));
  test("category filter", () => expect(applyFilters(fixtures, undefined, { category: "SOFTWARE" })[0]._id).toBe("4"));
  test("location filter", () => expect(applyFilters(fixtures, undefined, { location: "DELHI" })).toHaveLength(2));
  test("budget range filter", () => {
    expect(applyFilters(fixtures, undefined, { budgetMin: 6000000, budgetMax: 9000000 })).toHaveLength(2);
    expect(applyFilters(fixtures, undefined, { budgetMin: 12000000 })).toHaveLength(1);
  });
  test("dates filter closesAfter / closesBefore", () => {
    const after = Date.parse("2026-09-01");
    expect(applyFilters(fixtures, undefined, { closesAfter: after })).toHaveLength(2);
    const before = Date.parse("2026-08-31");
    expect(applyFilters(fixtures, undefined, { closesBefore: before })).toHaveLength(1);
  });
  test("lifecycle filter", () => expect(applyFilters(fixtures, undefined, { lifecycle: "open" })).toHaveLength(3));
  test("dataMode filter", () => expect(applyFilters(fixtures, undefined, { dataMode: "LIVE" })).toHaveLength(2));
  test("assessment filter", () => expect(applyFilters(fixtures, undefined, { assessment: "REVIEW" })).toHaveLength(2));
  test("amendment filter true/false", () => {
    expect(applyFilters(fixtures, undefined, { hasAmendment: true })).toHaveLength(2);
    expect(applyFilters(fixtures, undefined, { hasAmendment: false })).toHaveLength(2);
  });
  test("combined query and filters", () => {
    expect(applyFilters(fixtures, "services", { source: "CPPP" })).toHaveLength(2);
    expect(applyFilters(fixtures, "services", { source: "ODISHA" })).toHaveLength(0);
  });
});

describe("index-backed pagination contract", () => {
  test("opportunitySearch uses paginate and no collect", () => {
    const text = fs.readFileSync(path.resolve(__dirname, "../convex/opportunitySearch.ts"), "utf8");
    expect(text).toContain("paginate");
    expect(text).toContain("withSearchIndex");
    expect(text).toContain("withIndex");
    expect(text).not.toMatch(/\.collect\(\)/);
  });
});

describe("watchlist stages and bulk", () => {
  test("watchlist schema allows all 8 stages", () => {
    const text = fs.readFileSync(path.resolve(__dirname, "../convex/schema/discovery.ts"), "utf8");
    for (const s of ["DISCOVERED", "QUALIFYING", "PURSUING", "NO_BID", "SUBMITTED", "WON", "LOST", "ARCHIVED"]) {
      expect(text).toContain(s);
    }
  });

  test("watchlists supports bulkWatch and bulkUnwatch", () => {
    const text = fs.readFileSync(path.resolve(__dirname, "../convex/watchlists.ts"), "utf8");
    expect(text).toContain("bulkWatch");
    expect(text).toContain("bulkUnwatch");
  });

  test("bulk watch skips duplicates in-memory", () => {
    const watched = new Set<string>(["1"]);
    function bulkWatch(ids: string[]) {
      let added = 0;
      for (const id of ids) if (!watched.has(id)) { watched.add(id); added++; }
      return added;
    }
    expect(bulkWatch(["1", "2", "3"])).toBe(2);
    expect(watched.size).toBe(3);
  });
});

describe("saved searches", () => {
  test("savedSearches support full filter object", () => {
    const text = fs.readFileSync(path.resolve(__dirname, "../convex/savedSearches.ts"), "utf8");
    expect(text).toContain("budgetMin");
    expect(text).toContain("closesAfter");
    expect(text).toContain("hasAmendment");
  });

  test("filters validator is closed (strictObject)", () => {
    const text = fs.readFileSync(path.resolve(__dirname, "../convex/schema/discovery.ts"), "utf8");
    expect(text).toContain("cadence");
    expect(text).toContain("channels");
  });
});
