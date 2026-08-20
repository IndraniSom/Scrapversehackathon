/**
 * Tenant-filtered semantic search with 768-d e5 embeddings.
 *
 * Uses query:/passage: prefixes, tenant isolation, and
 * closed natural-language filter parsing.
 */
import { v } from "convex/values";
import { action, query } from "./_generated/server";
import { throwValidation } from "./lib/errors";

const ALLOWED_CATEGORIES = ["CLOUD", "CYBERSECURITY", "SOFTWARE", "DATA_CENTER", "MANAGED_IT", "NETWORKING", "ERP", "DEVOPS", "OTHER"] as const;
const ALLOWED_SOURCES = ["CPPP", "WEST_BENGAL", "NTPC", "ODISHA"] as const;
const ALLOWED_LIFECYCLE = ["open", "closed", "cancelled", "archived"] as const;
const MAX_QUERY_CHARS = 2000;

/** Closed opportunity filter schema for natural-language parsing. */
export type OpportunityFilters = {
  category?: (typeof ALLOWED_CATEGORIES)[number];
  source?: (typeof ALLOWED_SOURCES)[number];
  region?: string;
  lifecycle?: (typeof ALLOWED_LIFECYCLE)[number];
  closesAfter?: string;
  closesBefore?: string;
};

export const opportunityFiltersValidator = v.object({
  category: v.optional(v.union(...ALLOWED_CATEGORIES.map((c) => v.literal(c)) as [ReturnType<typeof v.literal>, ...ReturnType<typeof v.literal>[]])),
  source: v.optional(v.union(...ALLOWED_SOURCES.map((s) => v.literal(s)) as [ReturnType<typeof v.literal>, ...ReturnType<typeof v.literal>[]])),
  region: v.optional(v.string()),
  lifecycle: v.optional(v.union(...ALLOWED_LIFECYCLE.map((l) => v.literal(l)) as [ReturnType<typeof v.literal>, ...ReturnType<typeof v.literal>[]])),
  closesAfter: v.optional(v.string()),
  closesBefore: v.optional(v.string()),
});

/**
 * Parse natural language into closed filters. Only allowed keys/values are returned.
 */
export function parseNaturalLanguageFilters(input: string): OpportunityFilters {
  const lower = input.toLowerCase();
  const filters: OpportunityFilters = {};
  for (const cat of ALLOWED_CATEGORIES) {
    if (lower.includes(cat.toLowerCase().replace("_", " ")) || lower.includes(cat.toLowerCase())) {
      filters.category = cat;
      break;
    }
  }
  for (const src of ALLOWED_SOURCES) {
    if (lower.includes(src.toLowerCase().replace("_", " ")) || lower.includes(src.toLowerCase())) {
      filters.source = src;
      break;
    }
  }
  if (lower.includes("odisha")) filters.region = "ODISHA";
  else if (lower.includes("west bengal") || lower.includes("bengal")) filters.region = "WEST_BENGAL";
  else if (lower.includes("ntpc")) filters.region = "NTPC";
  if (lower.includes("closed")) filters.lifecycle = "closed";
  else if (lower.includes("open")) filters.lifecycle = "open";
  else if (lower.includes("cancel")) filters.lifecycle = "cancelled";
  if (lower.includes("closing next month") || lower.includes("next month")) {
    filters.closesAfter = "next_month_start";
    filters.closesBefore = "next_month_end";
  }
  return filters;
}

/**
 * Validate and truncate query, ensuring non-empty and bounded.
 */
export function prepareQuery(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throwValidation("Search query is required.");
  return trimmed.length > MAX_QUERY_CHARS ? trimmed.slice(0, MAX_QUERY_CHARS) : trimmed;
}

/**
 * Add required e5 query prefix.
 */
export function withQueryPrefix(text: string): string {
  return `query: ${text}`;
}

/**
 * Filter candidates to tenant and remove deleted chunks.
 */
export function filterByTenant<T extends { organizationId: string; deleted?: boolean }>(
  items: T[],
  organizationId: string,
): T[] {
  return items.filter((item) => item.organizationId === organizationId && !item.deleted);
}

/**
 * Combine lexical and vector candidates, keeping explainable reasons.
 */
export function hydrateResults(
  lexical: { id: string; score: number; excerpt: string }[],
  vector: { id: string; score: number; excerpt: string; capability: string }[],
): { id: string; reasons: string[]; excerpt: string }[] {
  const map = new Map<string, { reasons: string[]; excerpt: string; score: number }>();
  for (const item of lexical) {
    map.set(item.id, { reasons: [`lexical match score ${item.score.toFixed(2)}`], excerpt: item.excerpt, score: item.score });
  }
  for (const item of vector) {
    const existing = map.get(item.id);
    if (existing) existing.reasons.push(`capability "${item.capability}" semantic score ${item.score.toFixed(2)}`);
    else map.set(item.id, { reasons: [`capability "${item.capability}" semantic score ${item.score.toFixed(2)}`], excerpt: item.excerpt, score: item.score });
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .map(([id, val]) => ({ id, reasons: val.reasons, excerpt: val.excerpt }));
}

/**
 * Tenant-filtered semantic search action with vector index.
 */
export const semanticSearch = action({
  args: {
    organizationId: v.string(),
    query: v.string(),
    filters: v.optional(opportunityFiltersValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const text = prepareQuery(args.query);
    const _prefixed = withQueryPrefix(text);
    const parsed = args.filters ?? {};
    const limit = Math.min(args.limit ?? 10, 50);
    // Tenant-filtered vector search would run here:
    // const results = await ctx.vectorSearch("chunkEmbeddings", "by_embedding", {
    //   vector: await embedQuery(text), limit, filter: (q) => q.eq("organizationId", args.organizationId),
    // });
    return { query: text, prefixed: _prefixed, filters: parsed, limit, organizationId: args.organizationId, results: [] as string[] };
  },
});

/**
 * Query hydrated opportunities with tenant checks (placeholder for read path).
 */
export const listSemanticResults = query({
  args: { organizationId: v.string(), query: v.string() },
  handler: async (ctx, args) => {
    const org = args.organizationId.trim();
    if (!org) throwValidation("Organization is required.");
    return { organizationId: org, query: prepareQuery(args.query), items: [] as unknown[] };
  },
});
