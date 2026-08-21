/** Trusted assessment input loading and deterministic result persistence. */
import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import { throwNotFound, throwValidation } from "./lib/errors";

const outcomeValidator = v.object({
  rule_id: v.string(),
  evaluation: v.union(v.literal("PASS"), v.literal("FAIL"), v.literal("UNKNOWN"), v.literal("NOT_APPLICABLE")),
  actual: v.union(v.string(), v.null()),
  expected: v.union(v.string(), v.null()),
  explanation: v.string(),
  evidence: v.array(v.string()),
});

/** Loads bounded tenant-owned facts for one internal worker job. */
export const load = internalQuery({
  args: { jobId: v.id("jobs"), companyId: v.id("companies"), opportunityId: v.id("opportunities"), requirementSetId: v.id("requirementSets"), asOf: v.number() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    const company = await ctx.db.get(args.companyId);
    const opportunity = await ctx.db.get(args.opportunityId);
    const requirementSet = await ctx.db.get(args.requirementSetId);
    if (!job || !company || !opportunity || !requirementSet || job.kind !== "ASSESSMENT") throwNotFound("Assessment input not found.");
    const organizationId = job.organizationId;
    if ([company.organizationId, opportunity.organizationId, requirementSet.organizationId].some((value) => value !== organizationId)) throwNotFound("Assessment input not found.");
    const [turnover, certifications, projects, exemptions, requirements] = await Promise.all([
      ctx.db.query("companyTurnover").withIndex("by_organization_and_id", (query) => query.eq("organizationId", organizationId).eq("companyId", args.companyId)).collect(),
      ctx.db.query("companyCertifications").withIndex("by_organization_and_id", (query) => query.eq("organizationId", organizationId).eq("companyId", args.companyId)).collect(),
      ctx.db.query("companyProjects").withIndex("by_organization_and_id", (query) => query.eq("organizationId", organizationId).eq("companyId", args.companyId)).collect(),
      ctx.db.query("companyExemptions").withIndex("by_organization_and_id", (query) => query.eq("organizationId", organizationId).eq("companyId", args.companyId)).collect(),
      ctx.db.query("requirements").withIndex("by_organization_and_id", (query) => query.eq("organizationId", organizationId).eq("requirementSetId", args.requirementSetId)).collect(),
    ]);
    if (requirements.length === 0) throwValidation("Reviewed requirement set is empty.");
    return {
      body: {
        company_id: String(args.companyId), opportunity_id: String(args.opportunityId), lifecycle: opportunity.lifecycle, closes_at: opportunity.closesAt ?? null, as_of: args.asOf,
        company: {
          turnover: turnover.map((row) => ({ amountInr: row.amountInr, audited: row.audited })),
          certifications: certifications.map((row) => ({ name: row.name, validFrom: row.validFrom ?? null, validUntil: row.validUntil ?? null })),
          projects: projects.map((row) => ({ completionState: row.completionState })),
          exemptions: exemptions.map((row) => ({ scheme: row.scheme, qualificationState: row.qualificationState })),
        },
        requirements: requirements.map((row) => ({ id: String(row._id), hardness: row.hardness, predicate: row.predicate, evidence: (row.evidenceSpans ?? []).map((span) => `Page ${span.page}: ${span.text}`) })),
      },
      organizationId,
      inputRevision: job.inputRevision,
      inputHashes: job.inputHashes,
      traceId: job.traceId,
      requirementSetRevision: requirementSet.revision,
    };
  },
});

/** Persists one worker-validated assessment and all explainable rule outcomes. */
export const store = internalMutation({
  args: {
    jobId: v.id("jobs"), companyId: v.id("companies"), opportunityId: v.id("opportunities"), requirementSetRevision: v.number(), asOf: v.number(),
    recommendation: v.union(v.literal("BID"), v.literal("REVIEW"), v.literal("NO_BID")),
    counts: v.object({ pass: v.number(), fail: v.number(), unknown: v.number() }),
    rules: v.array(outcomeValidator),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.kind !== "ASSESSMENT" || !["DISPATCHED", "RUNNING"].includes(job.status)) throwValidation("Assessment job is not active.");
    const assessmentId = await ctx.db.insert("assessments", { organizationId: job.organizationId, companyId: args.companyId, opportunityId: args.opportunityId, requirementSetRevision: args.requirementSetRevision, recommendation: args.recommendation, counts: args.counts, asOf: args.asOf, createdAt: Date.now() });
    for (const rule of args.rules) await ctx.db.insert("ruleResults", { organizationId: job.organizationId, assessmentId, ruleId: rule.rule_id, evaluation: rule.evaluation, values: { actual: rule.actual ?? undefined, expected: rule.expected ?? undefined }, explanation: rule.explanation, evidence: rule.evidence, createdAt: Date.now() });
    return assessmentId;
  },
});
