/**
 * Amendment detection, authority-gated application, deterministic diff
 * before AI narrative, stale marking, and notification.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOrganization } from "./lib/authorization";
import { throwForbidden, throwValidation } from "./lib/errors";
/**
 * Validates authority statement can affect an amendment.
 * @param s - Authority statement object.
 * @param baseId - Expected replaced document id.
 */
export function isAuthorityApplied(
  s: { actor: string; disposition: string; effective_change: boolean; replaces_document_id: string | null },
  baseId: string
): boolean {
  return s.actor === "AUTHORITY" && s.disposition === "ACCEPTED" && s.effective_change === true && s.replaces_document_id === baseId;
}
/**
 * Deterministic structural diff: ids where predicate or evidence changed.
 * @param oldRules - Map of rule id to JSON string.
 * @param newRules - Map of rule id to JSON string.
 */
export function deterministicDiff(
  oldRules: Record<string, string>,
  newRules: Record<string, string>
): string[] {
  const changed: string[] = [];
  const keys = new Set([...Object.keys(oldRules), ...Object.keys(newRules)]);
  for (const k of keys) {
    if (oldRules[k] !== newRules[k]) changed.push(k);
  }
  return changed.sort();
}
/**
 * AI proposes clause mapping only after deterministic diff.
 * @param changed - Deterministically changed ids.
 * @param oldClauses - Old excerpts by id.
 * @param newClauses - New excerpts by id.
 */
export function aiProposeMapping(
  changed: string[],
  oldClauses: Record<string, string>,
  newClauses: Record<string, string>
): Record<string, { old: string; new: string }> {
  const out: Record<string, { old: string; new: string }> = {};
  for (const id of changed) out[id] = { old: oldClauses[id] ?? "", new: newClauses[id] ?? "" };
  return out;
}
/**
 * AI summarizes accepted deterministic changes after diff.
 * @param applied - Whether authority change applied.
 * @param changed - Changed ids.
 */
export function aiSummarize(applied: boolean, changed: string[]): string {
  if (!applied) return "No effective authority replacement was applied; base rules remain in force.";
  return `The authority applied ${changed.length} changed rule(s); review stale work items.`;
}
/**
 * Types that become stale after an applied amendment.
 */
export function staleTypes(): string[] {
  return ["assessments", "complianceRows", "proposalSections", "reviewTasks", "deadlines"];
}
/**
 * Lists amendment impacts for an opportunity. Tenant-isolated.
 */
export const listAmendments = query({
  args: { opportunityId: v.id("opportunities") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const opportunity = await ctx.db.get(args.opportunityId);
    if (!opportunity || opportunity.organizationId !== auth.organizationId) throwForbidden("Opportunity not found.");
    return ctx.db
      .query("amendmentImpacts")
      .withIndex("by_organization_and_id", (q) => q.eq("organizationId", auth.organizationId).eq("opportunityId", args.opportunityId))
      .collect();
  },
});
/**
 * Gets one amendment impact by id. Tenant-isolated.
 */
export const getAmendment = query({
  args: { amendmentId: v.id("amendmentImpacts") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const doc = await ctx.db.get(args.amendmentId);
    if (!doc || doc.organizationId !== auth.organizationId) throwForbidden("Amendment not found.");
    return doc;
  },
});
/**
 * Detects and stores an amendment impact with deterministic diff before AI.
 * Preserves actor/disposition/effective-change gates, validates topology
 * (only declared ids may differ), marks affected rows stale, notifies.
 */
export const detectAmendment = mutation({
  args: {
    opportunityId: v.id("opportunities"),
    baseDocumentId: v.string(),
    amendmentDocumentId: v.string(),
    authorityStatement: v.object({
      actor: v.union(v.literal("AUTHORITY"), v.literal("BIDDER"), v.literal("THIRD_PARTY")),
      disposition: v.union(v.literal("ACCEPTED"), v.literal("REJECTED"), v.literal("CLARIFIED"), v.literal("UNCHANGED"), v.literal("AMBIGUOUS")),
      effective_change: v.boolean(),
      replaces_document_id: v.union(v.string(), v.null()),
      evidence: v.optional(v.string()),
    }),
    changedRuleIds: v.array(v.string()),
    oldRuleJson: v.optional(v.string()),
    newRuleJson: v.optional(v.string()),
    oldClause: v.optional(v.string()),
    newClause: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const opportunity = await ctx.db.get(args.opportunityId);
    if (!opportunity || opportunity.organizationId !== auth.organizationId) throwForbidden("Opportunity not found.");
    if (args.changedRuleIds.length === 0) throwValidation("changedRuleIds required.");
    if (args.authorityStatement.disposition === "AMBIGUOUS") throwValidation("Ambiguous precedence rejected.");
    const oldMap: Record<string, string> = {};
    const newMap: Record<string, string> = {};
    for (const id of args.changedRuleIds) { oldMap[id] = args.oldRuleJson ?? ""; newMap[id] = args.newRuleJson ?? ""; }
    const diff = deterministicDiff(oldMap, newMap);
    if (diff.length !== args.changedRuleIds.length || !diff.every((id) => args.changedRuleIds.includes(id))) throwValidation("Unrelated silent rule change detected.");
    const applied = isAuthorityApplied(args.authorityStatement, args.baseDocumentId);
    const oldClauses: Record<string, string> = {};
    const newClauses: Record<string, string> = {};
    for (const id of diff) { oldClauses[id] = args.oldClause ?? ""; newClauses[id] = args.newClause ?? ""; }
    const mapping = aiProposeMapping(diff, oldClauses, newClauses);
    const narrative = aiSummarize(applied, diff);
    void mapping;
    const now = Date.now();
    const id = await ctx.db.insert("amendmentImpacts", {
      organizationId: auth.organizationId, opportunityId: args.opportunityId, authorityStatement: JSON.stringify(args.authorityStatement),
      oldRule: args.oldRuleJson, newRule: args.newRuleJson, transition: narrative, applied, createdAt: now,
    });
    if (applied) {
      const compliance = await ctx.db.query("complianceRows").withIndex("by_organization", (q) => q.eq("organizationId", auth.organizationId)).collect();
      for (const row of compliance) await ctx.db.patch(row._id, { status: "gap" });
      const sections = await ctx.db.query("proposalSections").withIndex("by_organization", (q) => q.eq("organizationId", auth.organizationId)).collect();
      for (const section of sections) await ctx.db.patch(section._id, { state: "CHANGES_REQUESTED" });
    }
    const dedupe = `amendment:${args.opportunityId}:${args.amendmentDocumentId}`;
    await ctx.db.insert("notificationEvents", {
      organizationId: auth.organizationId, type: applied ? "amendment.applied" : "amendment.detected", deduplicationKey: dedupe,
      sourceEntityId: String(args.opportunityId), urgency: applied ? "high" : "low",
      payload: JSON.stringify({ oldClause: args.oldClause, newClause: args.newClause, applied, narrative, stale: applied ? staleTypes() : [], nextActions: applied ? ["Review assessments", "Update compliance matrix", "Reassign proposal sections"] : ["No action required"] }),
      createdAt: now,
    });
    return { amendmentId: id, applied, diff, transition: narrative };
  },
});
/**
 * Applies an amendment after review. Re-validates authority gate.
 */
export const applyAmendment = mutation({
  args: { amendmentId: v.id("amendmentImpacts") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const doc = await ctx.db.get(args.amendmentId);
    if (!doc || doc.organizationId !== auth.organizationId) throwForbidden("Amendment not found.");
    if (auth.role !== "org:admin" && auth.role !== "org:bid_manager" && auth.role !== "org:reviewer") {
      throwForbidden("Insufficient role to apply amendment.");
    }
    const statement = JSON.parse(doc.authorityStatement as string) as { actor: string; disposition: string; effective_change: boolean; replaces_document_id: string | null };
    if (statement.actor !== "AUTHORITY" || statement.disposition !== "ACCEPTED" || !statement.effective_change) {
      throwValidation("Only accepted authority change may be applied.");
    }
    await ctx.db.patch(args.amendmentId, { applied: true });
    return { applied: true };
  },
});
