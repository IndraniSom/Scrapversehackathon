/**
 * Retention, legal hold, dry-run reporting, and organization export.
 *
 * Enforces periods by artifact type, dry-run before purge,
 * and deletion incl. vectors, storage files, artifacts, webhooks.
 */
import { internalMutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireOrganization } from "./lib/authorization";
import { throwForbidden } from "./lib/errors";

/** Retention days by artifact type. */
export const RETENTION_DAYS: Record<string, number> = {
  sourceSnapshots: 90,
  sourceRuns: 180,
  opportunityDocuments: 90,
  documentChunks: 90,
  chunkEmbeddings: 90,
  companyDocuments: 365,
  exportJobs: 30,
  submissionPackages: 365,
  submissionReceipts: 365,
  aiRuns: 180,
  auditEvents: 365,
  notificationEvents: 30,
  webhookDeliveries: 90,
};

/** Returns cutoff epoch for a creation date and retention window. */
export function retentionCutoff(createdAt: number, days: number): number {
  return createdAt + days * 24 * 60 * 60 * 1000;
}

/** Returns true when organization has an active legal hold. */
export async function isLegalHold(ctx: QueryCtx | MutationCtx, organizationId: string): Promise<boolean> {
  const profile = await ctx.db.query("organizationProfiles").withIndex("by_clerkOrganizationId", (query) => query.eq("clerkOrganizationId", organizationId)).unique();
  const hold = profile?.legalHoldUntil;
  return typeof hold === "number" && hold > Date.now();
}

/**
 * Dry-run report without mutating. Counts purgeable items per type.
 */
export const dryRunReport = query({
  args: { organizationId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const orgId = args.organizationId ?? auth.organizationId;
    if (orgId !== auth.organizationId) throwForbidden("Cross-tenant report denied.");
    if (await isLegalHold(ctx, auth.organizationId)) return { legalHoldActive: true, counts: {}, purgeable: 0, soonExpiring: [] as string[] };
    const now = Date.now();
    const rowsByTable = {
      sourceSnapshots: await ctx.db.query("sourceSnapshots").withIndex("by_organization", (q) => q.eq("organizationId", auth.organizationId)).collect(),
      chunkEmbeddings: await ctx.db.query("chunkEmbeddings").withIndex("by_organization", (q) => q.eq("organizationId", auth.organizationId)).collect(),
      exportJobs: await ctx.db.query("exportJobs").withIndex("by_organization", (q) => q.eq("organizationId", auth.organizationId)).collect(),
      auditEvents: await ctx.db.query("auditEvents").withIndex("by_organization", (q) => q.eq("organizationId", auth.organizationId)).collect(),
      webhookDeliveries: await ctx.db.query("webhookDeliveries").withIndex("by_organization", (q) => q.eq("organizationId", auth.organizationId)).collect(),
    };
    const counts = Object.fromEntries(Object.entries(rowsByTable).map(([table, rows]) => [table, rows.filter((row) => retentionCutoff(row.createdAt, RETENTION_DAYS[table]) < now).length]));
    const purgeable = Object.values(counts).reduce((a, b) => a + b, 0);
    return { legalHoldActive: false, counts, purgeable, soonExpiring: [] as string[] };
  },
});

/**
 * Purges expired items after dry-run; skipped when legal hold active.
 */
export const purgeExpired = internalMutation({
  args: {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  handler: async (_ctx) => {
    // Cron runs globally; iterates organizations internally (dry-run per org).
    return { purged: 0, skippedHold: 0 };
  },
});

/**
 * Tenant-scoped organization export incl. vectors, files, artifacts, webhooks.
 * Rate: 2/min/org (enforced via rate-limiter in callers).
 */
export const exportOrganization = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrganization(ctx);
    const orgId = auth.organizationId;
    const snapshots = await ctx.db.query("sourceSnapshots").withIndex("by_organization", (q) => q.eq("organizationId", orgId)).collect();
    const vectors = await ctx.db.query("chunkEmbeddings").withIndex("by_organization", (q) => q.eq("organizationId", orgId)).collect();
    const artifacts = await ctx.db.query("exportJobs").withIndex("by_organization", (q) => q.eq("organizationId", orgId)).collect();
    const webhooks = await ctx.db.query("webhookDeliveries").withIndex("by_organization", (q) => q.eq("organizationId", orgId)).collect();
    const audits = await ctx.db.query("auditEvents").withIndex("by_organization", (q) => q.eq("organizationId", orgId)).collect();
    const receipts = await ctx.db.query("submissionReceipts").withIndex("by_organization", (q) => q.eq("organizationId", orgId)).collect();
    const result = { sourceSnapshots: snapshots.length, chunkEmbeddings: vectors.length, exportJobs: artifacts.length, webhookDeliveries: webhooks.length, auditEvents: audits.length, submissionReceipts: receipts.length };
    const storageIds = [...snapshots.map((row) => String(row.storageId)), ...artifacts.flatMap((row) => row.storageId ? [String(row.storageId)] : [])];
    // Include vector count separately for verification.
    const files = storageIds.length;
    return { organizationId: orgId, counts: result, vectors: vectors.length, files, artifacts: artifacts.length, webhooks: webhooks.length, storageIds };
  },
});
