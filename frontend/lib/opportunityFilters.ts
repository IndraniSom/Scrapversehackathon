/**
 * URL-encoded closed Zod schema for opportunity discovery filters.
 *
 * Encodes filter state in the URL for shareable, validated navigation.
 * All values are strings in the URL and coerced to typed filters.
 */
import { z } from "zod";

export const opportunityFiltersSchema = z.strictObject({
  q: z.string().max(200).optional(),
  source: z.string().max(80).optional(),
  authority: z.string().max(120).optional(),
  category: z.string().max(80).optional(),
  location: z.string().max(80).optional(),
  budgetMin: z.coerce.number().int().min(0).optional(),
  budgetMax: z.coerce.number().int().min(0).optional(),
  closesAfter: z.coerce.number().int().optional(),
  closesBefore: z.coerce.number().int().optional(),
  publishedAfter: z.coerce.number().int().optional(),
  publishedBefore: z.coerce.number().int().optional(),
  lifecycle: z.enum(["open", "closed", "cancelled", "archived"]).optional(),
  dataMode: z.enum(["LIVE", "RECORDED_BRIGHT_DATA_SNAPSHOT", "MANUAL_FIXTURE"]).optional(),
  hasAmendment: z.enum(["true", "false"]).optional(),
  assessment: z.enum(["BID", "REVIEW", "NO_BID"]).optional(),
});

export type OpportunityFilters = z.infer<typeof opportunityFiltersSchema>;

export type ParsedFilters = {
  query?: string;
  filters: {
    source?: string;
    authority?: string;
    category?: string;
    location?: string;
    budgetMin?: number;
    budgetMax?: number;
    closesAfter?: number;
    closesBefore?: number;
    publishedAfter?: number;
    publishedBefore?: number;
    lifecycle?: string;
    dataMode?: string;
    hasAmendment?: boolean;
    assessment?: string;
  };
};

/**
 * Parses URLSearchParams through the closed schema.
 *
 * Returns typed ParsedFilters and a validation error flag.
 */
export function parseFiltersFromSearchParams(
  params: URLSearchParams,
): { parsed: ParsedFilters; error?: string } {
  const raw: Record<string, string> = {};
  for (const [k, v] of params.entries()) raw[k] = v;
  const result = opportunityFiltersSchema.safeParse(raw);
  if (!result.success) return { parsed: { filters: {} }, error: "Invalid filters" };
  const d = result.data;
  return {
    parsed: {
      query: d.q,
      filters: {
        source: d.source,
        authority: d.authority,
        category: d.category,
        location: d.location,
        budgetMin: d.budgetMin,
        budgetMax: d.budgetMax,
        closesAfter: d.closesAfter,
        closesBefore: d.closesBefore,
        publishedAfter: d.publishedAfter,
        publishedBefore: d.publishedBefore,
        lifecycle: d.lifecycle,
        dataMode: d.dataMode,
        hasAmendment: d.hasAmendment ? d.hasAmendment === "true" : undefined,
        assessment: d.assessment,
      },
    },
  };
}

/**
 * Serializes typed filters to a URL-encoded query string.
 *
 * Omits undefined values and encodes dates as epoch ms strings.
 */
export function filtersToSearchParams(parsed: ParsedFilters): string {
  const p = new URLSearchParams();
  if (parsed.query) p.set("q", parsed.query);
  const f = parsed.filters;
  if (f.source) p.set("source", f.source);
  if (f.authority) p.set("authority", f.authority);
  if (f.category) p.set("category", f.category);
  if (f.location) p.set("location", f.location);
  if (f.budgetMin !== undefined) p.set("budgetMin", String(f.budgetMin));
  if (f.budgetMax !== undefined) p.set("budgetMax", String(f.budgetMax));
  if (f.closesAfter !== undefined) p.set("closesAfter", String(f.closesAfter));
  if (f.closesBefore !== undefined) p.set("closesBefore", String(f.closesBefore));
  if (f.publishedAfter !== undefined) p.set("publishedAfter", String(f.publishedAfter));
  if (f.publishedBefore !== undefined) p.set("publishedBefore", String(f.publishedBefore));
  if (f.lifecycle) p.set("lifecycle", f.lifecycle);
  if (f.dataMode) p.set("dataMode", f.dataMode);
  if (f.hasAmendment !== undefined) p.set("hasAmendment", String(f.hasAmendment));
  if (f.assessment) p.set("assessment", f.assessment);
  return p.toString();
}
