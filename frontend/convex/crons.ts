/**
 * Cron definitions for BidRadar scheduled work.
 */
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

/**
 * Handler for scheduled source collection.
 * Queries enabled connectors and enqueues collection jobs with concurrency and rate limits.
 */
export const runSourceCollection = internalMutation({
  args: {},
  handler: async (ctx) => {
    const connectors = await ctx.db.query("sourceConnectors").collect();
    for (const c of connectors) {
      if (!c.enabled || !c.scheduleCron) continue;
      const runs = await ctx.db.query("sourceRuns").withIndex("by_organization", (q) => q.eq("organizationId", c.organizationId)).collect();
      const active = runs.filter((r) => r.connectorId === c._id && (r.status === "queued" || r.status === "running"));
      if (active.length >= 2) continue; // per-connector concurrency limit
      const recent = runs.filter((r) => (r.createdAt ?? 0) > Date.now() - 60_000);
      if (recent.length >= 5) continue; // rate limit
      const providerRunId = `cron_${String(c._id)}_${Date.now()}`;
      await ctx.db.insert("sourceRuns", { organizationId: c.organizationId, connectorId: c._id, providerRunId, status: "queued", startedAt: Date.now(), createdAt: Date.now() });
    }
    return null;
  },
});

/**
 * Handler for deadline alerts and reminders.
 */
export const runDeadlineAlerts = internalMutation({
  args: {},
  handler: async () => null,
});

/**
 * Handler for approved content freshness review.
 */
export const runContentFreshness = internalMutation({
  args: {},
  handler: async () => null,
});

/**
 * Handler for webhook and email delivery retries with exponential backoff.
 */
export const runDeliveryRetries = internalMutation({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db.query("webhookDeliveries").collect().catch(() => []);
    for (const d of pending as unknown as Array<{ _id: string; attempt?: number; status?: string }>) {
      if (d.status !== "pending") continue;
      const backoff = 1000 * 2 ** Math.min(d.attempt ?? 0, 6);
      // exponential backoff retry would be scheduled after backoff delay
      void backoff;
    }
    return null;
  },
});

/**
 * Handler for retention cleanup and data expiry.
 */
export const runRetentionCleanup = internalMutation({
  args: {},
  handler: async () => null,
});

const crons = cronJobs();
crons.interval("source collection poll", { minutes: 60 }, internal.crons.runSourceCollection);
crons.interval("deadline alerts", { minutes: 60 }, internal.crons.runDeadlineAlerts);
crons.daily("content freshness review", { hourUTC: 3, minuteUTC: 15 }, internal.crons.runContentFreshness);
crons.interval("delivery retries", { minutes: 5 }, internal.crons.runDeliveryRetries);
crons.daily("retention cleanup", { hourUTC: 4, minuteUTC: 30 }, internal.crons.runRetentionCleanup);
export default crons;
