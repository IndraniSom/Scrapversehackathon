/** Bright Data collection orchestration and signed-result persistence. */
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireOrganization } from "./lib/authorization";
import { throwForbidden, throwRateLimited, throwValidation } from "./lib/errors";

const MAX_CONCURRENT = 2;
const RATE_WINDOW_MS = 60_000;
const providerRecord = v.union(
  v.object({
    sourceTenderId: v.string(),
    title: v.string(),
    authority: v.string(),
    canonicalUrl: v.string(),
    referenceNumber: v.optional(v.string()),
  }),
  v.object({
    source_tender_id: v.string(),
    title: v.string(),
    authority: v.string(),
    canonical_url: v.string(),
    reference_number: v.optional(v.string()),
  }),
);

/** Calculates bounded exponential retry delay. */
export function exponentialBackoff(attempt: number, baseMs = 1000): number {
  return baseMs * 2 ** Math.min(attempt, 6);
}

/** Validates provider run chronology. */
export function isValidChronology(startedAt: number | undefined, completedAt: number | undefined): boolean {
  return startedAt === undefined || completedAt === undefined || completedAt >= startedAt;
}

/** Returns next retry timestamp. */
export function nextRetryAt(attempt: number): number {
  return Date.now() + exponentialBackoff(attempt);
}

/** Creates and schedules one collection after concurrency/rate checks. */
async function queueCollection(
  ctx: MutationCtx,
  connector: Doc<"sourceConnectors">,
) {
  const runs = await ctx.db.query("sourceRuns").withIndex("by_organization", (index) => index.eq("organizationId", connector.organizationId)).collect();
  const active = runs.filter((run) => run.connectorId === connector._id && (run.status === "queued" || run.status === "running"));
  if (active.length >= MAX_CONCURRENT) throwRateLimited("Concurrency limit reached.");
  if (runs.filter((run) => run.createdAt > Date.now() - RATE_WINDOW_MS).length >= 5) throwRateLimited("Rate limit exceeded.");
  const runId = await ctx.db.insert("sourceRuns", {
    organizationId: connector.organizationId,
    connectorId: connector._id,
    status: "queued",
    createdAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.sourceProvider.startCollection, { runId });
  return runId;
}

/** Queues a manual collection for caller-owned connector. */
export const triggerCollection = mutation({
  args: { connectorId: v.id("sourceConnectors"), trigger: v.union(v.literal("manual"), v.literal("cron")) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const connector = await ctx.db.get(args.connectorId);
    if (connector === null || connector.organizationId !== auth.organizationId) throwForbidden("Connector not found.");
    if (!connector.enabled) throwValidation("Connector disabled.");
    if (!connector.policyReviewedAt) throwValidation("Policy review required.");
    return queueCollection(ctx, connector);
  },
});

/** Persists one verified provider result against its connector tenant. */
export const handleWebhook = internalMutation({
  args: {
    connectorId: v.string(),
    providerRunId: v.string(),
    collectorVersion: v.string(),
    startedAt: v.number(),
    completedAt: v.number(),
    rawSnapshotHash: v.string(),
    digest: v.optional(v.string()),
    status: v.union(v.literal("succeeded"), v.literal("failed"), v.literal("retryable")),
    records: v.optional(v.array(providerRecord)),
    storageId: v.id("_storage"),
    failureCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const connector = (await ctx.db.query("sourceConnectors").collect()).find((candidate) => String(candidate._id) === args.connectorId);
    if (connector === undefined || !connector.enabled) throwValidation("Connector not found.");
    if (args.collectorVersion !== connector.collectorVersion) throwValidation("Collector version mismatch.");
    if (!isValidChronology(args.startedAt, args.completedAt)) throwValidation("Invalid chronology.");
    // Duplicate provider deliveries are acknowledged without replaying persistence.
    const existing = await ctx.db.query("sourceRuns").withIndex("by_organization_and_id", (index) => index.eq("organizationId", connector.organizationId).eq("providerRunId", args.providerRunId)).unique();
    if (existing !== null) return existing._id;
    if (args.status === "succeeded" && (!args.records || args.records.length === 0)) throwValidation("Malformed record: empty success.");
    const runId = await ctx.db.insert("sourceRuns", {
      organizationId: connector.organizationId,
      connectorId: connector._id,
      providerRunId: args.providerRunId,
      status: args.status,
      rawSnapshotHash: args.digest ?? args.rawSnapshotHash,
      counters: { fetched: args.records?.length ?? 0, normalized: args.records?.length ?? 0 },
      failureCode: args.failureCode,
      startedAt: args.startedAt,
      completedAt: args.completedAt,
      createdAt: Date.now(),
    });
    const snapshotId = await ctx.db.insert("sourceSnapshots", {
      organizationId: connector.organizationId,
      sourceRunId: runId,
      storageId: args.storageId,
      digest: args.digest ?? args.rawSnapshotHash,
      provenance: { collectorVersion: args.collectorVersion, providerRunId: args.providerRunId },
      createdAt: Date.now(),
    });
    for (const record of args.records ?? []) {
      const normalized = "sourceTenderId" in record
        ? record
        : { sourceTenderId: record.source_tender_id, title: record.title, authority: record.authority, canonicalUrl: record.canonical_url, referenceNumber: record.reference_number };
      await ctx.scheduler.runAfter(0, internal.opportunities.upsertOpportunity, {
        organizationId: connector.organizationId,
        source: connector.portal,
        sourceTenderId: normalized.sourceTenderId,
        title: normalized.title,
        authority: normalized.authority,
        referenceNumber: normalized.referenceNumber,
        canonicalUrl: normalized.canonicalUrl,
        dataMode: "LIVE",
        snapshotId,
      });
    }
    return runId;
  },
});

/** Queues scheduled collection for every eligible connector. */
export const cronTrigger = internalMutation({
  args: {},
  handler: async (ctx) => {
    const connectors = await ctx.db.query("sourceConnectors").collect();
    for (const connector of connectors) {
      if (connector.enabled && connector.scheduleCron) await queueCollection(ctx, connector);
    }
  },
});

/** Lists caller-owned runs for one connector. */
export const listRuns = query({
  args: { connectorId: v.id("sourceConnectors") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const connector = await ctx.db.get(args.connectorId);
    if (connector === null || connector.organizationId !== auth.organizationId) throwForbidden("Connector not found.");
    return (await ctx.db.query("sourceRuns").withIndex("by_organization", (index) => index.eq("organizationId", auth.organizationId)).collect())
      .filter((run) => run.connectorId === args.connectorId)
      .sort((left, right) => right.createdAt - left.createdAt);
  },
});
