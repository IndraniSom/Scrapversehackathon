/** Authenticated semantic opportunity search through worker embeddings. */
import { v } from "convex/values";
import { action, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireOrganization } from "./lib/authorization";
import { throwValidation } from "./lib/errors";

const CATEGORIES = ["CLOUD", "CYBERSECURITY", "SOFTWARE", "DATA_CENTER", "MANAGED_IT", "NETWORKING", "ERP", "DEVOPS", "OTHER"] as const;
const SOURCES = ["CPPP", "WEST_BENGAL", "NTPC", "ODISHA"] as const;
const LIFECYCLES = ["open", "closed", "cancelled", "archived"] as const;
const MAX_QUERY_CHARS = 2000;

/** Closed semantic search filters. */
export type OpportunityFilters = {
  category?: (typeof CATEGORIES)[number];
  source?: (typeof SOURCES)[number];
  region?: string;
  lifecycle?: (typeof LIFECYCLES)[number];
};
type SearchItem = { id: string; title: string; authority: string; excerpt: string; capability: string; reasons: string[] };
type SearchResponse = { query: string; filters: OpportunityFilters; items: SearchItem[] };

const filtersValidator = v.object({
  category: v.optional(v.union(...CATEGORIES.map((value) => v.literal(value)))),
  source: v.optional(v.union(...SOURCES.map((value) => v.literal(value)))),
  region: v.optional(v.string()),
  lifecycle: v.optional(v.union(...LIFECYCLES.map((value) => v.literal(value)))),
});

/** Parses user language into editable closed filters. */
export function parseNaturalLanguageFilters(input: string): OpportunityFilters {
  const lower = input.toLowerCase();
  const filters: OpportunityFilters = {};
  for (const category of CATEGORIES) if (lower.includes(category.toLowerCase().replace("_", " "))) filters.category = category;
  for (const source of SOURCES) if (lower.includes(source.toLowerCase().replace("_", " "))) filters.source = source;
  if (lower.includes("odisha")) filters.region = "ODISHA";
  else if (lower.includes("west bengal") || lower.includes("bengal")) filters.region = "WEST_BENGAL";
  if (lower.includes("closed")) filters.lifecycle = "closed";
  else if (lower.includes("open")) filters.lifecycle = "open";
  else if (lower.includes("cancel")) filters.lifecycle = "cancelled";
  return filters;
}

/** Validates and bounds one semantic query. */
export function prepareQuery(raw: string): string {
  const query = raw.trim();
  if (!query) throwValidation("Search query is required.");
  return query.slice(0, MAX_QUERY_CHARS);
}

/** Prefixes e5 query text. */
export function withQueryPrefix(text: string): string {
  return `query: ${text}`;
}

/** Computes exact-body worker signature. */
async function sign(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return `sha256=${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** Returns authenticated organization for semantic action. */
export const authorize = internalQuery({
  args: {},
  handler: async (ctx) => (await requireOrganization(ctx)).organizationId,
});

/** Hydrates vector IDs into authorized opportunity results. */
export const hydrate = internalQuery({
  args: {
    organizationId: v.string(),
    matches: v.array(v.object({ embeddingId: v.id("chunkEmbeddings"), score: v.number() })),
    filters: filtersValidator,
  },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (auth.organizationId !== args.organizationId) throwValidation("Organization mismatch.");
    const items: SearchItem[] = [];
    for (const match of args.matches) {
      const embedding = await ctx.db.get(match.embeddingId);
      if (embedding === null || embedding.organizationId !== auth.organizationId) continue;
      const chunk = await ctx.db.get(embedding.chunkId);
      if (chunk === null || chunk.organizationId !== auth.organizationId) continue;
      const document = await ctx.db.get(chunk.documentId);
      if (document === null || document.organizationId !== auth.organizationId) continue;
      const opportunity = await ctx.db.get(document.opportunityId);
      if (opportunity === null || opportunity.organizationId !== auth.organizationId) continue;
      if (args.filters.category && opportunity.category !== args.filters.category) continue;
      if (args.filters.source && opportunity.source !== args.filters.source) continue;
      if (args.filters.lifecycle && opportunity.lifecycle !== args.filters.lifecycle) continue;
      if (args.filters.region && opportunity.location !== args.filters.region) continue;
      items.push({
        id: String(opportunity._id),
        title: opportunity.title,
        authority: opportunity.authority,
        excerpt: chunk.boundedText,
        capability: embedding.contentKind,
        reasons: [`semantic similarity ${match.score.toFixed(3)}`],
      });
    }
    return items;
  },
});

/** Runs tenant-filtered vector search using FastAPI-produced embedding. */
export const semanticSearch = action({
  args: { query: v.string(), filters: filtersValidator, limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<SearchResponse> => {
    const organizationId: string = await ctx.runQuery(internal.semanticSearch.authorize, {});
    const baseUrl = process.env.BIDRADAR_WORKER_BASE_URL;
    const secret = process.env.BIDRADAR_WORKER_HMAC_SECRET;
    if (!baseUrl || !secret) throwValidation("Semantic worker is unavailable.");
    const query = prepareQuery(args.query);
    const body = JSON.stringify({ text: query, mode: "query" });
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/internal/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Worker-Signature": await sign(body, secret) },
      body,
    });
    if (!response.ok) throwValidation("Semantic worker failed.");
    const payload: unknown = await response.json();
    if (payload === null || typeof payload !== "object" || !("embedding" in payload) || !Array.isArray(payload.embedding) || payload.embedding.length !== 768) throwValidation("Semantic worker response is invalid.");
    const raw = await ctx.vectorSearch("chunkEmbeddings", "by_embedding", {
      vector: payload.embedding.map(Number),
      limit: Math.min(Math.max(args.limit ?? 10, 1), 50),
      filter: (filter) => filter.eq("organizationId", organizationId),
    });
    const matches = raw.map((match) => ({ embeddingId: match._id as Id<"chunkEmbeddings">, score: match._score }));
    const items: SearchItem[] = await ctx.runQuery(internal.semanticSearch.hydrate, { organizationId, matches, filters: args.filters });
    return { query, filters: args.filters, items };
  },
});

/** Hydrates persisted semantic IDs for reactive clients. */
export const listSemanticResults = query({
  args: { opportunityIds: v.array(v.id("opportunities")) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const items = [];
    for (const opportunityId of args.opportunityIds) {
      const opportunity = await ctx.db.get(opportunityId);
      if (opportunity !== null && opportunity.organizationId === auth.organizationId) items.push(opportunity);
    }
    return items;
  },
});
