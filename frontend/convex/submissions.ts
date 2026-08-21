/**
 * Submission package queries and mutations with tenant isolation.
 *
 * Rejects stale approvals, missing evidence, amendment gaps,
 * and handles assisted handoff receipts with digest, step-up,
 * approval, duplicate, and AI guards.
 */
import { v } from "convex/values";
import { action, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireOrganization } from "./lib/authorization";
import { throwConflict, throwForbidden, throwNotFound, throwValidation } from "./lib/errors";

/** Validates sha256 hex. */
function isSha256(d: string): boolean { return /^[a-f0-9]{64}$/i.test(d); }

/**
 * List submission packages for the caller's organization.
 * Optionally filters by proposal. Returns deterministic order.
 */
export const list = query({
  args: { proposalId: v.optional(v.id("proposalProjects")) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const q = ctx.db.query("submissionPackages").withIndex("by_organization", (qb) => qb.eq("organizationId", auth.organizationId));
    const all = await q.collect();
    const filtered = args.proposalId ? all.filter((p) => p.proposalId === args.proposalId) : all;
    return filtered.sort((a, b) => a.createdAt - b.createdAt);
  },
});

/**
 * Get one submission package by id, enforcing tenant isolation.
 */
export const get = query({
  args: { submissionId: v.id("submissionPackages") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const pkg = await ctx.db.get(args.submissionId);
    if (!pkg || pkg.organizationId !== auth.organizationId) return null;
    return pkg;
  },
});

/**
 * Create a submission package from locked exports.
 * Validates approvals, section states, and amendment currency deterministically.
 */
export const create = mutation({
  args: { proposalId: v.id("proposalProjects"), exportIds: v.array(v.id("exportJobs")) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (args.exportIds.length === 0) throwValidation("At least one export is required.");
    const sortedIds = [...args.exportIds].sort();
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.organizationId !== auth.organizationId) throwValidation("Proposal not found.");
    const gates = await ctx.db.query("approvalGates").withIndex("by_organization_and_id", (qb) => qb.eq("organizationId", auth.organizationId).eq("targetId", args.proposalId)).collect();
    for (const g of gates) if (g.decision !== "approved") throwValidation("MISSING_APPROVAL");
    if (gates.length === 0) throwValidation("MISSING_APPROVAL");
    const sections = await ctx.db.query("proposalSections").withIndex("by_organization_and_id", (qb) => qb.eq("organizationId", auth.organizationId).eq("proposalId", args.proposalId)).collect();
    for (const s of sections) if (s.state !== "APPROVED" && s.state !== "LOCKED") throwValidation("UNAPPROVED_SECTION");
    const impacts = await ctx.db.query("amendmentImpacts").withIndex("by_organization_and_id", (qb) => qb.eq("organizationId", auth.organizationId).eq("opportunityId", proposal.opportunityId)).collect();
    for (const imp of impacts) if (!imp.applied) throwValidation("STALE_AMENDMENT");
    const now = Date.now();
    const id = await ctx.db.insert("submissionPackages", { organizationId: auth.organizationId, proposalId: args.proposalId, exportIds: sortedIds, validationState: "valid", approvalState: "draft", createdAt: now });
    return { submissionId: id, exportIds: sortedIds };
  },
});

/**
 * Approve a submission package. Requires bid_manager or admin.
 */
export const approve = mutation({
  args: { submissionId: v.id("submissionPackages") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (auth.role !== "org:admin" && auth.role !== "org:bid_manager") throwValidation("Insufficient role.");
    const pkg = await ctx.db.get(args.submissionId);
    if (!pkg || pkg.organizationId !== auth.organizationId) throwValidation("Package not found.");
    if (pkg.validationState !== "valid") throwValidation("Package is not valid.");
    await ctx.db.patch(args.submissionId, { approvalState: "approved" });
    return { submissionId: args.submissionId };
  },
});

/**
 * Records portal acknowledgement after manual submission.
 * Requires step-up, approval, digest, duplicate check, audit, AI guard.
 */
export const recordReceipt = mutation({
  args: { packageId: v.id("submissionPackages"), portal: v.string(), acknowledgement: v.string(), portalTimestamp: v.number(), packageDigest: v.string(), evidenceDigest: v.optional(v.string()), stepUpVerified: v.boolean(), approvalVerified: v.boolean() },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (auth.role !== "org:admin" && auth.role !== "org:bid_manager") throwForbidden("Only bid manager or admin may record receipt.");
    if (auth.clerkUserId.startsWith("ai_") || auth.tokenIdentifier.includes("ai")) throwForbidden("AI cannot change submission state.");
    if (!args.stepUpVerified) throwForbidden("Step-up authentication required.");
    if (!args.approvalVerified) throwForbidden("Approval required before receipt.");
    const ack = args.acknowledgement.trim();
    if (!ack || ack.length < 6) throwValidation("Acknowledgement number required.");
    if (!Number.isFinite(args.portalTimestamp) || args.portalTimestamp > Date.now() + 60000) throwValidation("Invalid portal timestamp.");
    if (!isSha256(args.packageDigest)) throwValidation("Valid package digest required.");
    if (args.evidenceDigest && !isSha256(args.evidenceDigest)) throwValidation("Invalid evidence digest.");
    const pkg = await ctx.db.get(args.packageId);
    if (!pkg || pkg.organizationId !== auth.organizationId) throwNotFound("Submission package not found.");
    const existing = await ctx.db.query("submissionReceipts").withIndex("by_organization_and_id", (q) => q.eq("organizationId", auth.organizationId).eq("packageId", args.packageId)).collect();
    if (existing.some((r) => r.acknowledgement === ack)) throwConflict("Duplicate receipt acknowledgement.");
    const manifest = (pkg as { manifest?: string }).manifest;
    if (manifest && manifest !== args.packageDigest) throwConflict("Stale package: digest mismatch.");
    const receiptId = await ctx.db.insert("submissionReceipts", { organizationId: auth.organizationId, packageId: args.packageId, portal: args.portal, acknowledgement: ack, submittedAt: args.portalTimestamp, submittedBy: auth.clerkUserId, createdAt: Date.now() });
    await ctx.db.insert("auditEvents", { organizationId: auth.organizationId, actorId: auth.clerkUserId, action: "submission.receipt", targetType: "submissionReceipt", targetId: receiptId, afterDigest: args.packageDigest, traceId: crypto.randomUUID(), createdAt: Date.now() });
    return { receiptId, acknowledgement: ack, digest: args.packageDigest };
  },
});

/**
 * Prepares handoff with checklist and official link validation.
 * Mirrors integrations prepare for package flow; checks stale, audit.
 */
export const prepareHandoff = mutation({
  args: { packageId: v.id("submissionPackages"), portal: v.string(), officialUrl: v.string(), serverClockAcknowledged: v.boolean(), emdVerified: v.boolean(), signingVerified: v.boolean(), filenamesVerified: v.boolean(), stepUpVerified: v.boolean(), approvalVerified: v.boolean(), packageDigest: v.string() },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (auth.clerkUserId.startsWith("ai_") || auth.tokenIdentifier.includes("ai")) throwForbidden("AI cannot change submission state.");
    if (!args.stepUpVerified) throwForbidden("Step-up authentication required.");
    if (!args.approvalVerified) throwForbidden("Approval required.");
    if (!/^https:\/\/.+\..+/.test(args.officialUrl)) throwValidation("Official portal link required.");
    if (!args.serverClockAcknowledged || !args.emdVerified || !args.signingVerified || !args.filenamesVerified) throwValidation("Checklist incomplete.");
    if (!isSha256(args.packageDigest)) throwValidation("Valid package digest required.");
    const pkg = await ctx.db.get(args.packageId);
    if (!pkg || pkg.organizationId !== auth.organizationId) throwNotFound("Submission package not found.");
    const manifest = (pkg as { manifest?: string }).manifest;
    if (manifest && manifest !== args.packageDigest) throwConflict("Stale package: digest mismatch.");
    await ctx.db.insert("auditEvents", { organizationId: auth.organizationId, actorId: auth.clerkUserId, action: "submission.prepareHandoff", targetType: "submissionPackage", targetId: args.packageId, afterDigest: args.packageDigest, traceId: crypto.randomUUID(), createdAt: Date.now() });
    return { prepared: true, digest: args.packageDigest };
  },
});

/**
 * Returns receipt status for a package; tenant-isolated.
 */
export const getStatus = query({
  args: { packageId: v.id("submissionPackages") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const pkg = await ctx.db.get(args.packageId);
    if (!pkg || pkg.organizationId !== auth.organizationId) throwNotFound("Submission package not found.");
    const receipts = await ctx.db.query("submissionReceipts").withIndex("by_organization_and_id", (q) => q.eq("organizationId", auth.organizationId).eq("packageId", args.packageId)).collect();
    return { packageId: args.packageId, receipts: receipts.map((r) => ({ acknowledgement: r.acknowledgement, submittedAt: r.submittedAt, portal: r.portal })) };
  },
});

/** Returns approved ZIP bearer URL only to authenticated package tenant. */
export const getDownloadUrl = action({
  args: { packageId: v.id("submissionPackages") },
  handler: async (ctx, args): Promise<string | null> => {
    const storageId = await ctx.runQuery(internal.submissions.getApprovedZip, args);
    return ctx.storage.getUrl(storageId);
  },
});

/** Resolves caller-owned approved ZIP storage for download action. */
export const getApprovedZip = internalQuery({
  args: { packageId: v.id("submissionPackages") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const pkg = await ctx.db.get(args.packageId);
    if (pkg === null || pkg.organizationId !== auth.organizationId || pkg.validationState !== "valid" || pkg.approvalState !== "approved") throwForbidden("Package download is not approved.");
    for (const exportId of pkg.exportIds) {
      const job = await ctx.db.get(exportId);
      if (job !== null && job.organizationId === auth.organizationId && job.format === "zip" && job.storageId) return job.storageId;
    }
    throwNotFound("ZIP export not found.");
  },
});
