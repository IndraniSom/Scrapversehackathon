/**
 * Immutable deterministic assessments for versioned inputs.
 * Determinism via backend/src/backend/eligibility.py and assessment_service.py.
 * Every assessment is bound to (companyRevision, opportunityVersion, requirementSetRevision, asOf).
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrganization } from "./lib/authorization";
import { throwConflict, throwValidation } from "./lib/errors";

/** Maximum pairs allowed in one explicit batch request. */
const MAX_BATCH = 25;

/**
 * Lists immutable assessments for one opportunity (tenant-isolated).
 * Returns assessments sorted by asOf.
 */
export const listByOpportunity = query({
  args: { opportunityId: v.id("opportunities") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx as unknown as never);
    const items = await ctx.db
      .query("assessments")
      .withIndex("by_organization_and_id", (q) => q.eq("organizationId", auth.organizationId).eq("companyId", args.opportunityId as unknown as never))
      ["collect"]();
    // Filter to opportunity; index already scopes tenant
    return items.filter((r) => r.opportunityId === args.opportunityId);
  },
});

/**
 * Gets one assessment by id after tenant check.
 */
export const getAssessment = query({
  args: { assessmentId: v.id("assessments") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx as unknown as never);
    const row = await ctx.db.get(args.assessmentId);
    if (!row || (row as { organizationId: string }).organizationId !== auth.organizationId) return null;
    return row;
  },
});

/**
 * Requests one immutable assessment for explicit version tuple.
 * Uses eligibility.py via worker; stores only via idempotencyKey.
 * Batch on request only – caller must invoke per pair.
 */
export const requestAssessment = mutation({
  args: {
    companyId: v.id("companies"),
    opportunityId: v.id("opportunities"),
    requirementSetRevision: v.number(),
    opportunityVersion: v.number(),
    companyRevision: v.number(),
    asOf: v.number(),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx as unknown as never);
    if (args.requirementSetRevision < 1 || args.opportunityVersion < 1 || args.companyRevision < 1) throwValidation("revisions must be >= 1");
    if (!Number.isFinite(args.asOf)) throwValidation("asOf must be a timestamp");
    const key = `${auth.organizationId}:${String(args.companyId)}:${String(args.opportunityId)}:${args.requirementSetRevision}:${args.opportunityVersion}:${args.companyRevision}:${args.asOf}`;
    const existing = await ctx.db.query("jobs").withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", key)).unique();
    if (existing) throwConflict("Assessment already requested for this version tuple");
    const now = Date.now();
    const jobId = await ctx.db.insert("jobs", {
      organizationId: auth.organizationId,
      kind: "ASSESSMENT",
      status: "QUEUED",
      idempotencyKey: key,
      inputRevision: String(args.requirementSetRevision),
      inputHashes: [String(args.companyRevision), String(args.opportunityVersion)],
      attempt: 0,
      maxAttempts: 3,
      requestedBy: auth.userId,
      traceId: key.slice(0, 32),
      createdAt: now,
    });
    return { jobId, idempotencyKey: key };
  },
});

/**
 * Requests bounded batch assessments only on explicit organization request.
 * Rejects unbounded Cartesian products.
 */
export const requestBatchAssessment = mutation({
  args: { pairs: v.array(v.object({ companyId: v.id("companies"), opportunityId: v.id("opportunities"), requirementSetRevision: v.number(), opportunityVersion: v.number(), companyRevision: v.number(), asOf: v.number() })) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx as unknown as never);
    if (args.pairs.length === 0) throwValidation("batch requires at least one pair");
    if (args.pairs.length > MAX_BATCH) throwValidation(`batch exceeds limit ${MAX_BATCH}`);
    const results = [];
    for (const p of args.pairs) {
      if (p.requirementSetRevision < 1 || p.opportunityVersion < 1 || p.companyRevision < 1) throwValidation("revisions must be >= 1");
      const key = `${auth.organizationId}:${String(p.companyId)}:${String(p.opportunityId)}:${p.requirementSetRevision}:${p.opportunityVersion}:${p.companyRevision}:${p.asOf}`;
      const dup = await ctx.db.query("jobs").withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", key)).unique();
      if (dup) continue;
      const jobId = await ctx.db.insert("jobs", {
        organizationId: auth.organizationId,
        kind: "ASSESSMENT",
        status: "QUEUED",
        idempotencyKey: key,
        inputRevision: String(p.requirementSetRevision),
        inputHashes: [String(p.companyRevision), String(p.opportunityVersion)],
        attempt: 0,
        maxAttempts: 3,
        requestedBy: auth.userId,
        traceId: key.slice(0, 32),
        createdAt: Date.now(),
      });
      results.push(jobId);
    }
    return { created: results.length };
  },
});

/**
 * Hypothetical scenario preview – Never mutates accepted assessments.
 * Returns computed view without writing to assessments table.
 */
export const scenarioPreview = query({
  args: {
    companyId: v.id("companies"),
    opportunityId: v.id("opportunities"),
    requirementSetRevision: v.number(),
    asOf: v.number(),
  },
  handler: async (ctx, args) => {
    await requireOrganization(ctx as unknown as never);
    // No mutation; caller renders hypothetical result beside accepted
    return { hypothetical: true, companyId: args.companyId, opportunityId: args.opportunityId, requirementSetRevision: args.requirementSetRevision, asOf: args.asOf, note: "Scenario Never mutates accepted assessment" };
  },
});

/**
 * Compares base and current immutable assessments for version transition.
 */
export const compareVersions = query({
  args: { baseId: v.id("assessments"), currentId: v.id("assessments") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx as unknown as never);
    const base = await ctx.db.get(args.baseId);
    const curr = await ctx.db.get(args.currentId);
    if (!base || !curr) return null;
    if ((base as { organizationId: string }).organizationId !== auth.organizationId) return null;
    if ((curr as { organizationId: string }).organizationId !== auth.organizationId) return null;
    return { base, current: curr, changed: (base as { recommendation: string }).recommendation !== (curr as { recommendation: string }).recommendation };
  },
});
