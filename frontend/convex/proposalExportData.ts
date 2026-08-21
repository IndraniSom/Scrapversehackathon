/** Tenant-checked proposal package input and artifact persistence. */
import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import { requireOrganization } from "./lib/authorization";
import { throwForbidden, throwNotFound, throwValidation } from "./lib/errors";

/** Escapes one CSV cell for deterministic compliance export. */
function csv(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/** Loads one locked tenant proposal into bounded renderer input. */
export const prepare = internalQuery({
  args: { proposalId: v.id("proposalProjects") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (auth.role !== "org:admin" && auth.role !== "org:bid_manager") throwForbidden("Only bid manager may export proposal.");
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.organizationId !== auth.organizationId) throwNotFound("Proposal not found.");
    if (!proposal.lockedRevision) throwValidation("Proposal must be locked before export.");
    const sections = await ctx.db.query("proposalSections").withIndex("by_organization_and_id", (query) => query.eq("organizationId", auth.organizationId).eq("proposalId", args.proposalId)).collect();
    if (!sections.length || sections.some((section) => section.state !== "LOCKED" || !section.body?.trim())) throwValidation("Every proposal section must be locked and non-empty.");
    const rows = await ctx.db.query("complianceRows").withIndex("by_organization_and_id", (query) => query.eq("organizationId", auth.organizationId).eq("proposalId", args.proposalId)).collect();
    if (rows.some((row) => row.status !== "compliant" || !row.evidence || !row.responseLocation)) throwValidation("Compliance matrix has unresolved rows.");
    const compliance = ["requirement_id,response_location,evidence,status", ...rows.map((row) => [String(row.requirementId), row.responseLocation ?? "", row.evidence ?? "", row.status].map(csv).join(","))].join("\n") + "\n";
    return { organizationId: auth.organizationId, userId: auth.clerkUserId, body: { proposal_id: String(proposal._id), title: `Proposal ${String(proposal._id)}`, revision: proposal.lockedRevision, sections: sections.map((section) => ({ title: section.title, body: section.body ?? "", citation: section.instructionCitation, order: section.order, state: section.state })), compliance_csv: compliance } };
  },
});

/** Stores rendered ZIP metadata and creates approved handoff package. */
export const store = internalMutation({
  args: { organizationId: v.string(), userId: v.string(), proposalId: v.id("proposalProjects"), storageId: v.id("_storage"), digest: v.string(), sourceRevision: v.number() },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.organizationId !== args.organizationId || proposal.lockedRevision !== args.sourceRevision) throwNotFound("Locked proposal not found.");
    const exportId = await ctx.db.insert("exportJobs", { organizationId: args.organizationId, format: "zip", sourceRevision: args.sourceRevision, outputDigest: args.digest, storageId: args.storageId, createdAt: Date.now() });
    const submissionId = await ctx.db.insert("submissionPackages", { organizationId: args.organizationId, proposalId: args.proposalId, exportIds: [exportId], manifest: args.digest, validationState: "valid", approvalState: "approved", createdAt: Date.now() });
    await ctx.db.insert("auditEvents", { organizationId: args.organizationId, actorId: args.userId, action: "proposal.package", targetType: "submissionPackage", targetId: String(submissionId), afterDigest: args.digest, createdAt: Date.now() });
    return { exportId, submissionId };
  },
});
