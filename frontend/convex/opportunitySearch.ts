/**
 * Opportunity discovery with full-text prefix and filtered cursor pagination.
 *
 * Provides index-backed search without unbounded collect(). Supports
 * keyword/prefix across title search index and equality/range filters for
 * source, authority, category, location, budget, dates, lifecycle,
 * dataMode, assessment recommendation, and amendment presence.
 */
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { query } from "./_generated/server";
import { requireOrganization } from "./lib/authorization";

const filtersValidator = v.optional(
  v.object({
    source: v.optional(v.string()),
    authority: v.optional(v.string()),
    category: v.optional(v.string()),
    location: v.optional(v.string()),
    budgetMin: v.optional(v.number()),
    budgetMax: v.optional(v.number()),
    closesAfter: v.optional(v.number()),
    closesBefore: v.optional(v.number()),
    publishedAfter: v.optional(v.number()),
    publishedBefore: v.optional(v.number()),
    lifecycle: v.optional(v.union(v.literal("open"), v.literal("closed"), v.literal("cancelled"), v.literal("archived"))),
    dataMode: v.optional(v.union(v.literal("LIVE"), v.literal("RECORDED_BRIGHT_DATA_SNAPSHOT"), v.literal("MANUAL_FIXTURE"))),
    hasAmendment: v.optional(v.boolean()),
    assessment: v.optional(v.string()),
  }),
);

/**
 * Cursor-paginated opportunity search.
 *
 * Uses search index when query is present, otherwise uses the most
 * selective organization index. Additional filters are applied via
 * index-backed .filter before paginate. No collect() is used.
 */
export const search = query({
  args: {
    query: v.optional(v.string()),
    filters: filtersValidator,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganization(ctx);
    const f = args.filters ?? {};
    const term = args.query?.trim() ?? "";
    const hasQuery = term.length > 0;

    // Base typed query without any: start from organization index.
    type OpportunityQuery = ReturnType<typeof ctx.db.query<"opportunities">>;
    let q: OpportunityQuery = ctx.db
      .query("opportunities")
      .withIndex("by_organization", (builder) => builder.eq("organizationId", organizationId)) as OpportunityQuery;

    if (hasQuery) {
      q = ctx.db
        .query("opportunities")
        .withSearchIndex("search_title", (builder) => {
          let s = builder.search("title", term).eq("organizationId", organizationId);
          if (f.source) s = s.eq("source", f.source as unknown as never);
          if (f.category) s = s.eq("category", f.category as unknown as never);
          if (f.lifecycle) s = s.eq("lifecycle", f.lifecycle);
          return s;
        }) as unknown as OpportunityQuery;
    } else if (f.source) {
      const src = f.source as string;
      q = ctx.db
        .query("opportunities")
        .withIndex("by_organization_source", (builder) =>
          builder.eq("organizationId", organizationId).eq("source", src),
        ) as unknown as OpportunityQuery;
    } else if (f.category) {
      const cat = f.category as string;
      q = ctx.db
        .query("opportunities")
        .withIndex("by_organization_category", (builder) =>
          builder.eq("organizationId", organizationId).eq("category", cat),
        ) as unknown as OpportunityQuery;
    } else if (f.lifecycle) {
      q = ctx.db
        .query("opportunities")
        .withIndex("by_organization_lifecycle", (builder) =>
          builder.eq("organizationId", organizationId).eq("lifecycle", f.lifecycle as "open" | "closed" | "cancelled" | "archived"),
        ) as unknown as OpportunityQuery;
    } else if (f.location) {
      const loc = f.location as string;
      q = ctx.db
        .query("opportunities")
        .withIndex("by_organization_location", (builder) =>
          builder.eq("organizationId", organizationId).eq("location", loc),
        ) as unknown as OpportunityQuery;
    } else if (f.dataMode) {
      q = ctx.db
        .query("opportunities")
        .withIndex("by_organization_dataMode", (builder) =>
          builder.eq("organizationId", organizationId).eq("dataMode", f.dataMode as "LIVE" | "RECORDED_BRIGHT_DATA_SNAPSHOT" | "MANUAL_FIXTURE"),
        ) as unknown as OpportunityQuery;
    }

    // Apply remaining filters using filter builder before pagination.
    let filtered: OpportunityQuery = q;
    if (f.authority !== undefined) {
      const auth = f.authority as string;
      filtered = filtered.filter((builder) => builder.eq(builder.field("authority"), auth)) as unknown as OpportunityQuery;
    }
    if (f.location !== undefined && hasQuery) {
      const loc = f.location as string;
      filtered = filtered.filter((builder) => builder.eq(builder.field("location"), loc)) as unknown as OpportunityQuery;
    }
    if (f.dataMode !== undefined && hasQuery) {
      const dm = f.dataMode as string;
      filtered = filtered.filter((builder) => builder.eq(builder.field("dataMode"), dm)) as unknown as OpportunityQuery;
    }
    if (f.budgetMin !== undefined) {
      const min = f.budgetMin;
      filtered = filtered.filter((builder) => builder.gte(builder.field("budgetAmount"), min)) as unknown as OpportunityQuery;
    }
    if (f.budgetMax !== undefined) {
      const max = f.budgetMax;
      filtered = filtered.filter((builder) => builder.lte(builder.field("budgetAmount"), max)) as unknown as OpportunityQuery;
    }
    if (f.closesAfter !== undefined) {
      const v2 = f.closesAfter;
      filtered = filtered.filter((builder) => builder.gte(builder.field("closesAt"), v2)) as unknown as OpportunityQuery;
    }
    if (f.closesBefore !== undefined) {
      const v2 = f.closesBefore;
      filtered = filtered.filter((builder) => builder.lte(builder.field("closesAt"), v2)) as unknown as OpportunityQuery;
    }
    if (f.publishedAfter !== undefined) {
      const v2 = f.publishedAfter;
      filtered = filtered.filter((builder) => builder.gte(builder.field("publishedAt"), v2)) as unknown as OpportunityQuery;
    }
    if (f.publishedBefore !== undefined) {
      const v2 = f.publishedBefore;
      filtered = filtered.filter((builder) => builder.lte(builder.field("publishedAt"), v2)) as unknown as OpportunityQuery;
    }
    if (f.hasAmendment !== undefined) {
      const v2 = f.hasAmendment;
      filtered = filtered.filter((builder) => builder.eq(builder.field("hasAmendment"), v2)) as unknown as OpportunityQuery;
    }
    if (f.assessment !== undefined) {
      const v2 = f.assessment as string;
      filtered = filtered.filter((builder) => builder.eq(builder.field("assessmentRecommendation"), v2)) as unknown as OpportunityQuery;
    }

    const result = await filtered.paginate(args.paginationOpts);
    return result;
  },
});
