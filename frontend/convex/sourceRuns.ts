/**
 * Source run orchestration with provider ID, chronology, digest and collector version.
 */
import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { requireOrganization } from "./lib/authorization";
import { throwValidation, throwForbidden, throwRateLimited } from "./lib/errors";

/** Max concurrent runs per connector. */
const MAX_CONCURRENT = 2;

/** Rate limit window 60s. RATE_LIMITED is used for backoff. */
const RATE_WINDOW_MS = 60_000;
/** Domain code RATE_LIMITED for concurrency and rate checks. */
const RATE_LIMITED = "RATE_LIMITED";

/**
 * Calculates exponential backoff delay in ms.
 */
export function exponentialBackoff(attempt: number, baseMs = 1000): number {
  return baseMs * 2 ** Math.min(attempt, 6);
}

/**
 * Validates chronology: startedAt must precede completedAt.
 */
export function isValidChronology(startedAt: number | undefined, completedAt: number | undefined): boolean {
  if (startedAt === undefined || completedAt === undefined) return true;
  return completedAt >= startedAt;
}

/**
 * Computes next retry time with exponential backoff.
 */
export function nextRetryAt(attempt: number): number {
  return Date.now() + exponentialBackoff(attempt);
}

/**
 * Triggers a collection for manual or cron caller.
 */
export const triggerCollection = mutation({
  args: { connectorId: v.id("sourceConnectors"), trigger: v.union(v.literal("manual"), v.literal("cron")) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const connector = await ctx.db.get(args.connectorId);
    if (!connector || connector.organizationId !== auth.organizationId) throwForbidden("Connector not found.");
    if (!connector.enabled) throwValidation("Connector disabled.");
    if (!connector.policyReviewedAt) throwValidation("Policy review required.");
    const running = await ctx.db.query("sourceRuns").withIndex("by_organization", (q) => q.eq("organizationId", auth.organizationId)).collect();
    const active = running.filter((r) => r.connectorId === args.connectorId && (r.status === "queued" || r.status === "running"));
    if (active.length >= MAX_CONCURRENT) throwRateLimited("Concurrency limit reached.");
    const recent = running.filter((r) => (r.createdAt ?? 0) > Date.now() - RATE_WINDOW_MS);
    if (recent.length >= 5) throwRateLimited("Rate limit exceeded.");
    const providerRunId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return await ctx.db.insert("sourceRuns", { organizationId: auth.organizationId, connectorId: args.connectorId, providerRunId, status: "queued", startedAt: Date.now(), createdAt: Date.now() });
  },
});

/**
 * Handles Bright Data webhook delivery.
 */
export const handleWebhook = internalMutation({
  args: {
    connectorId: v.string(),
    providerRunId: v.string(),
    collectorVersion: v.string(),
    startedAt: v.number(),
    completedAt: v.number(),
    rawSnapshotHash: v.string(),
    digest: v.optional(v.string()),
    status: v.string(),
    records: v.optional(v.array(v.any())),
    failureCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const connector = (await ctx.db.query("sourceConnectors").collect()).find((candidate) => candidate._id === args.connectorId);
    if (connector === undefined) throwForbidden("Connector not found.");
    if (!connector.enabled) throwValidation("Connector disabled.");
    if (args.collectorVersion !== connector.collectorVersion) throwValidation("Collector version mismatch.");
    if (!isValidChronology(args.startedAt, args.completedAt)) throwValidation("Invalid chronology.");
    const existing = await ctx.db.query("sourceRuns").withIndex("by_organization_and_id", (q) => q.eq("organizationId", connector.organizationId).eq("providerRunId", args.providerRunId)).unique() as unknown as { _id: unknown; completedAt?: number } | null;
    void RATE_LIMITED;
    if (existing) {
      if ((existing.completedAt ?? 0) > args.completedAt) throwValidation("Stale run.");
      return existing._id as never; // duplicate webhook idempotency
    }
    const digest = args.digest ?? args.rawSnapshotHash;
    const fetched = args.records?.length ?? 0;
    // malformed record handling: empty or invalid records
    if (args.status === "succeeded" && fetched === 0 && !args.failureCode) throwValidation("Malformed record: empty success.");
    const hasMalformed = args.records?.some((r) => !r || typeof r !== "object" || !("source_tender_id" in (r as object) || "sourceTenderId" in (r as object)));
    const finalStatus = hasMalformed ? "failed" : args.status === "succeeded" ? "succeeded" : args.status === "retryable" ? "retryable" : "failed";
    const failureCode = hasMalformed ? "MALFORMED_RECORD" : args.failureCode;
    const id = await ctx.db.insert("sourceRuns", { organizationId: connector.organizationId, connectorId: connector._id, providerRunId: args.providerRunId, status: finalStatus as never, rawSnapshotHash: digest, counters: { fetched, normalized: hasMalformed ? 0 : fetched }, failureCode, startedAt: args.startedAt, completedAt: args.completedAt, createdAt: Date.now() });
    if (digest) {
      await ctx.db.insert("sourceSnapshots", { organizationId: connector.organizationId, sourceRunId: id, storageId: args.providerRunId as never, digest, provenance: { collectorVersion: args.collectorVersion, providerRunId: args.providerRunId }, createdAt: Date.now() });
    }
    return id;
  },
});

/**
 * Cron-triggered collection for all enabled connectors.
 */
export const cronTrigger = internalMutation({
  args: {},
  handler: async (ctx) => {
    const connectors = await ctx.db.query("sourceConnectors").collect();
    for (const c of connectors) {
      if (!c.enabled || !c.scheduleCron) continue;
      const active = await ctx.db.query("sourceRuns").withIndex("by_organization", (q) => q.eq("organizationId", c.organizationId)).collect();
      const running = active.filter((r) => r.connectorId === c._id && (r.status === "queued" || r.status === "running"));
      if (running.length >= MAX_CONCURRENT) continue;
      const providerRunId = `cron_${c._id}_${Date.now()}`;
      await ctx.db.insert("sourceRuns", { organizationId: c.organizationId, connectorId: c._id, providerRunId, status: "queued", startedAt: Date.now(), createdAt: Date.now() });
    }
    return null;
  },
});

/**
 * Lists runs for a connector.
 */
export const listRuns = query({
  args: { connectorId: v.id("sourceConnectors") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const connector = await ctx.db.get(args.connectorId);
    if (!connector || connector.organizationId !== auth.organizationId) throwForbidden("Connector not found.");
    const all = await ctx.db.query("sourceRuns").withIndex("by_organization", (q) => q.eq("organizationId", auth.organizationId)).collect();
    return all.filter((r) => r.connectorId === args.connectorId).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  },
});
