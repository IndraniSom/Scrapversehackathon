/**
 * Immutable deterministic assessments for versioned inputs.
 * Determinism via backend/src/backend/runtime_assessment.py.
 * Every assessment is bound to (companyRevision, opportunityVersion, requirementSetRevision, asOf).
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import type { AuthContext } from "./lib/authorization";
import { requireOrganization } from "./lib/authorization";
import { throwValidation } from "./lib/errors";

/** Maximum pairs allowed in one explicit batch request. */
const MAX_BATCH = 25;

/** Queues one version-bound assessment or returns its existing idempotent job. */
async function queueAssessment(ctx: MutationCtx, auth: AuthContext, companyId: Id<"companies">, opportunityId: Id<"opportunities">): Promise<{ jobId: Id<"jobs">; idempotencyKey: string; created: boolean }> {
  const company = await ctx.db.get(companyId);
  const opportunity = await ctx.db.get(opportunityId);
  if (!company || company.organizationId !== auth.organizationId || !opportunity || opportunity.organizationId !== auth.organizationId) throwValidation("Company or opportunity not found.");
  const documents = await ctx.db.query("opportunityDocuments").withIndex("by_organization_and_id", (q) => q.eq("organizationId", auth.organizationId).eq("opportunityId", opportunityId)).collect();
  const requirementSets: Array<Doc<"requirementSets">> = [];
  for (const document of documents) requirementSets.push(...await ctx.db.query("requirementSets").withIndex("by_organization_and_id", (q) => q.eq("organizationId", auth.organizationId).eq("documentId", document._id)).collect());
  const accepted = requirementSets.filter((set) => set.extractionState === "extracted" && set.reviewState === "approved").sort((left, right) => right.revision - left.revision)[0];
  if (!accepted) throwValidation("Approved requirement set required.");
  const opportunityRevision = opportunity.currentVersionId ? String(opportunity.currentVersionId) : String(opportunity.updatedAt);
  const key = `${auth.organizationId}:${String(companyId)}:${String(opportunityId)}:${accepted.revision}:${opportunityRevision}:${company.revision}`;
  const existing = await ctx.db.query("jobs").withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", key)).unique();
  if (existing) return { jobId: existing._id, idempotencyKey: key, created: false };
  const asOf = Date.now();
  const jobId = await ctx.db.insert("jobs", { organizationId: auth.organizationId, kind: "ASSESSMENT", status: "QUEUED", idempotencyKey: key, inputRevision: String(accepted.revision), inputHashes: [String(company.revision), opportunityRevision], attempt: 0, maxAttempts: 3, requestedBy: auth.userId, traceId: key.slice(0, 32), createdAt: asOf });
  await ctx.scheduler.runAfter(0, internal.assessmentWorker.execute, { jobId, companyId, opportunityId, requirementSetId: accepted._id, asOf });
  return { jobId, idempotencyKey: key, created: true };
}

/**
 * Lists immutable assessments for one opportunity (tenant-isolated).
 * Returns assessments sorted by asOf.
 */
export const listByOpportunity = query({
  args: { opportunityId: v.id("opportunities") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const opportunity = await ctx.db.get(args.opportunityId);
    if (!opportunity || opportunity.organizationId !== auth.organizationId) throwValidation("Opportunity not found.");
    const items = await ctx.db
      .query("assessments")
      .withIndex("by_organization_opportunity", (q) => q.eq("organizationId", auth.organizationId).eq("opportunityId", args.opportunityId))
      .collect();
    return Promise.all(items.map(async (assessment) => ({ ...assessment, ruleResults: await ctx.db.query("ruleResults").withIndex("by_organization_and_id", (q) => q.eq("organizationId", auth.organizationId).eq("assessmentId", assessment._id)).collect() })));
  },
});

/**
 * Gets one assessment by id after tenant check.
 */
export const getAssessment = query({
  args: { assessmentId: v.id("assessments") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const row = await ctx.db.get(args.assessmentId);
    if (!row || row.organizationId !== auth.organizationId) return null;
    return row;
  },
});

/**
 * Requests one immutable assessment for explicit version tuple.
 * Uses eligibility.py via worker; stores only via idempotencyKey.
 * Batch on request only – caller must invoke per pair.
 */
export const requestAssessment = mutation({
  args: { companyId: v.id("companies"), opportunityId: v.id("opportunities") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    return queueAssessment(ctx, auth, args.companyId, args.opportunityId);
  },
});

/**
 * Requests bounded batch assessments only on explicit organization request.
 * Rejects unbounded Cartesian products.
 */
export const requestBatchAssessment = mutation({
  args: { pairs: v.array(v.object({ companyId: v.id("companies"), opportunityId: v.id("opportunities") })) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (args.pairs.length === 0) throwValidation("batch requires at least one pair");
    if (args.pairs.length > MAX_BATCH) throwValidation(`batch exceeds limit ${MAX_BATCH}`);
    const results = [];
    for (const pair of args.pairs) results.push(await queueAssessment(ctx, auth, pair.companyId, pair.opportunityId));
    return { created: results.filter((result) => result.created).length, jobIds: results.map((result) => result.jobId) };
  },
});

/**
 * Compares base and current immutable assessments for version transition.
 */
export const compareVersions = query({
  args: { baseId: v.id("assessments"), currentId: v.id("assessments") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const base = await ctx.db.get(args.baseId);
    const curr = await ctx.db.get(args.currentId);
    if (!base || !curr) return null;
    if (base.organizationId !== auth.organizationId || curr.organizationId !== auth.organizationId) return null;
    return { base, current: curr, changed: base.recommendation !== curr.recommendation };
  },
});
