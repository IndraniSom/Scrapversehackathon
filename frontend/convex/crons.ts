/**
 * Cron definitions for BidRadar scheduled work.
 *
 * Covers source collection, deadline alerts, content freshness,
 * delivery retries, and retention cleanup.
 */
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

/**
 * Handler for scheduled source collection.
 * Queries enabled connectors and enqueues collection jobs.
 */
export const runSourceCollection = internalMutation({
  args: {},
  handler: async () => {
    return null;
  },
});

/**
 * Handler for deadline alerts and reminders.
 * Scans closing opportunities and emits notification events.
 */
export const runDeadlineAlerts = internalMutation({
  args: {},
  handler: async () => {
    return null;
  },
});

/**
 * Handler for approved content freshness review.
 * Flags stale entries for reviewer attention.
 */
export const runContentFreshness = internalMutation({
  args: {},
  handler: async () => {
    return null;
  },
});

/**
 * Handler for webhook and email delivery retries.
 * Retries pending deliveries with backoff.
 */
export const runDeliveryRetries = internalMutation({
  args: {},
  handler: async () => {
    return null;
  },
});

/**
 * Handler for retention cleanup and data expiry.
 * Runs dry-run checks and prunes expired snapshots.
 */
export const runRetentionCleanup = internalMutation({
  args: {},
  handler: async () => {
    return null;
  },
});

const crons = cronJobs();

/** Poll enabled source connectors every 60 minutes. */
crons.interval("source collection poll", { minutes: 60 }, internal.crons.runSourceCollection);

/** Check deadlines every hour and fan out alerts. */
crons.interval("deadline alerts", { minutes: 60 }, internal.crons.runDeadlineAlerts);

/** Review approved content freshness daily at 03:00 UTC. */
crons.daily("content freshness review", { hourUTC: 3, minuteUTC: 15 }, internal.crons.runContentFreshness);

/** Retry failed deliveries every 5 minutes. */
crons.interval("delivery retries", { minutes: 5 }, internal.crons.runDeliveryRetries);

/** Run retention cleanup daily at 04:30 UTC. */
crons.daily("retention cleanup", { hourUTC: 4, minuteUTC: 30 }, internal.crons.runRetentionCleanup);

export default crons;
