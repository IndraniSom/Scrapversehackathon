/**
 * Outcome analytics and hypothetical assessment labeling.
 *
 * Hypothetical recomputations never mutate accepted assessments.
 * Outcomes are organization-owned with export/deletion support.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOrganization } from "./lib/authorization";
import { throwValidation } from "./lib/errors";

const ALLOWED_RESULTS = ["won", "lost", "no_submit"] as const;
const ALLOWED_REASONS = [
  "price",
  "technical_score",
  "eligibility_gap",
  "missing_evidence",
  "deadline_missed",
  "capacity",
  "commercial",
  "compliance",
  "incumbent",
  "relationship",
  "other",
] as const;
const MIN_SAMPLE = 5;
const DISCLAIMER = "Descriptive summary only; sparse data cannot prove causation or predict wins.";

/** Validates reason categories against closed set. */
function validateReasons(reasons: string[]): void {
  for (const r of reasons) if (!(ALLOWED_REASONS as readonly string[]).includes(r)) throwValidation(`Invalid reason category: ${r}`);
}

/**
 * Records a won/lost/no_submit outcome with structured reasons.
 * Organization-owned, audited by actor.
 */
export const recordOutcome = mutation({
  args: {
    opportunityId: v.optional(v.id("opportunities")),
    result: v.union(v.literal("won"), v.literal("lost"), v.literal("no_submit")),
    valueInr: v.optional(v.number()),
    reasonCategories: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    evidence: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const reasons = args.reasonCategories ?? [];
    validateReasons(reasons);
    if (!ALLOWED_RESULTS.includes(args.result)) throwValidation("Invalid result");
    if (args.notes && args.notes.length > 2000) throwValidation("Notes too long");
    const now = Date.now();
    const id = await ctx.db.insert("bidOutcomes", {
      organizationId: auth.organizationId,
      opportunityId: args.opportunityId,
      result: args.result,
      valueInr: args.valueInr,
      reasonCategories: reasons,
      notes: args.notes,
      evidence: args.evidence,
      createdAt: now,
    });
    await ctx.db.insert("auditEvents", {
      organizationId: auth.organizationId,
      actorId: auth.clerkUserId,
      action: "bid_outcome.recorded",
      targetType: "bidOutcomes",
      targetId: String(id),
      traceId: String(id),
      createdAt: now,
    });
    return { id, isHypothetical: false as const };
  },
});

/** Lists organization outcomes newest first. */
export const listOutcomes = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrganization(ctx);
    const rows = await ctx.db.query("bidOutcomes").withIndex("by_organization", (q) => q.eq("organizationId", auth.organizationId)).collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * Aggregates counts, timelines with minimum-sample disclosure.
 * Never claims win causation.
 */
export const getOutcomeStats = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrganization(ctx);
    const rows = await ctx.db.query("bidOutcomes").withIndex("by_organization", (q) => q.eq("organizationId", auth.organizationId)).collect();
    const byResult: Record<string, number> = {};
    const byReason: Record<string, number> = {};
    const byMonth: Record<string, number> = {};
    for (const r of rows) {
      byResult[r.result] = (byResult[r.result] ?? 0) + 1;
      for (const c of r.reasonCategories ?? []) byReason[c] = (byReason[c] ?? 0) + 1;
      const month = new Date(r.createdAt).toISOString().slice(0, 7);
      byMonth[month] = (byMonth[month] ?? 0) + 1;
    }
    const total = rows.length;
    const disclosure = total < MIN_SAMPLE ? `Sample size ${total} — trends are descriptive, not predictive.` : `Sample size ${total} — ${DISCLAIMER}`;
    const suggestions: string[] = [];
    if ((byReason["missing_evidence"] ?? 0) >= 2) suggestions.push("Review content library: 2+ losses cite missing_evidence — verify evidence. (observation, not causation)");
    if ((byResult["no_submit"] ?? 0) >= 2) suggestions.push("Process bottleneck: multiple no_submit — audit deadlines. (observation, not causation)");
    if ((byReason["compliance"] ?? 0) >= 1) suggestions.push("Compliance matrix review suggested. (observation, not causation)");
    if (total >= MIN_SAMPLE && (byResult["lost"] ?? 0) > (byResult["won"] ?? 0)) suggestions.push("Consider tuning saved searches: losses outnumber wins — review filters without assuming causation. (observation, not causation)");
    if (suggestions.length === 0) suggestions.push("No pattern meets threshold; continue recording outcomes. (observation, not causation)");
    return { total, byResult, byReason, byMonth, disclosure, disclaimer: DISCLAIMER, minimumSample: MIN_SAMPLE, suggestions };
  },
});

/** Exports outcomes with hypothetical=false label and disclaimer. */
export const exportOutcomes = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrganization(ctx);
    const rows = await ctx.db.query("bidOutcomes").withIndex("by_organization", (q) => q.eq("organizationId", auth.organizationId)).collect();
    return {
      exportType: "bid_outcomes" as const,
      isHypothetical: false as const,
      recordCount: rows.length,
      records: rows.map((r) => ({ result: r.result, reasonCategories: r.reasonCategories, createdAt: r.createdAt, valueInr: r.valueInr, notes: r.notes })),
      disclaimer: DISCLAIMER,
    };
  },
});

/** Deletes an organization-owned outcome with audit. */
export const deleteOutcome = mutation({
  args: { outcomeId: v.id("bidOutcomes") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const row = await ctx.db.get(args.outcomeId);
    if (!row || row.organizationId !== auth.organizationId) throwValidation("Outcome not found");
    await ctx.db.delete(args.outcomeId);
    await ctx.db.insert("auditEvents", {
      organizationId: auth.organizationId,
      actorId: auth.clerkUserId,
      action: "bid_outcome.deleted",
      targetType: "bidOutcomes",
      targetId: String(args.outcomeId),
      traceId: String(args.outcomeId),
      createdAt: Date.now(),
    });
    return { deleted: true as const };
  },
});

/**
 * Returns a hypothetical assessment label without mutating accepted records.
 * Purely informational; no database write.
 */
export const hypotheticalLabel = query({
  args: {},
  handler: async (ctx) => {
    await requireOrganization(ctx);
    return { isHypothetical: true as const, label: "hypothetical", note: "Simulations never mutate accepted assessments." };
  },
});
