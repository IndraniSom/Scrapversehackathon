/**
 * Source connector configuration with domain allowlist and policy review.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOrganization } from "./lib/authorization";
import { throwValidation, throwForbidden, throwConflict } from "./lib/errors";

/** Allowed portal domains for collection. */
export const ALLOWED_DOMAINS: Record<string, string> = {
  NTPC: "ntpctender.ntpc.co.in",
  CPPP: "www.eprocure.gov.in",
  WEST_BENGAL: "wbtenders.gov.in",
  ODISHA: "odisha.gov.in",
};

/** Max collectors per organization. */
const MAX_CONNECTORS = 20;

/**
 * Validates domain allowlist for a target URL.
 */
export function isAllowedDomain(url: string, portal: string): boolean {
  try {
    const host = new URL(url).hostname;
    const allowed = ALLOWED_DOMAINS[portal];
    return !!allowed && host === allowed;
  } catch {
    return false;
  }
}

/**
 * Validates collector name/version format.
 */
export function isValidCollector(name: string, version: string): boolean {
  return /^[a-z0-9-]{3,64}$/.test(name) && /^[a-z0-9.-]{1,32}$/.test(version);
}

/**
 * Validates cron schedule expression or null for manual-only.
 */
export function isValidSchedule(cron: string | undefined): boolean {
  if (!cron) return true;
  return /^([*\/\d,\- ]+)$/.test(cron) && cron.length < 64;
}

/**
 * Creates or updates a source connector for the organization.
 */
export const upsertConnector = mutation({
  args: {
    portal: v.string(),
    collectorName: v.string(),
    collectorVersion: v.string(),
    scheduleCron: v.optional(v.string()),
    policyReviewedAt: v.optional(v.number()),
    enabled: v.boolean(),
    targetUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (!isValidCollector(args.collectorName, args.collectorVersion)) throwValidation("Invalid collector/version.");
    if (!isValidSchedule(args.scheduleCron)) throwValidation("Invalid schedule.");
    if (!(args.portal in ALLOWED_DOMAINS)) throwValidation("Portal not in domain allowlist.");
    if (args.targetUrl && !isAllowedDomain(args.targetUrl, args.portal)) throwValidation("Target domain not allowlisted.");
    if (args.policyReviewedAt && args.policyReviewedAt > Date.now()) throwValidation("Policy review is in future.");
    const existing = await ctx.db.query("sourceConnectors").withIndex("by_organization_and_id", (q) => q.eq("organizationId", auth.organizationId).eq("portal", args.portal)).unique();
    if (existing && args.policyReviewedAt === undefined) throwValidation("Policy review required.");
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { collectorName: args.collectorName, collectorVersion: args.collectorVersion, scheduleCron: args.scheduleCron, policyReviewedAt: args.policyReviewedAt, enabled: args.enabled, updatedAt: now });
      return existing._id;
    }
    const count = await ctx.db.query("sourceConnectors").withIndex("by_organization", (q) => q.eq("organizationId", auth.organizationId)).collect();
    if (count.length >= MAX_CONNECTORS) throwConflict("Connector limit reached.");
    if (!args.policyReviewedAt) throwValidation("Policy review required.");
    return await ctx.db.insert("sourceConnectors", { organizationId: auth.organizationId, portal: args.portal, collectorName: args.collectorName, collectorVersion: args.collectorVersion, scheduleCron: args.scheduleCron, policyReviewedAt: args.policyReviewedAt, enabled: args.enabled, createdAt: now, updatedAt: now });
  },
});

/**
 * Toggles connector enabled state.
 */
export const setConnectorEnabled = mutation({
  args: { connectorId: v.id("sourceConnectors"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const doc = await ctx.db.get(args.connectorId);
    if (!doc || doc.organizationId !== auth.organizationId) throwForbidden("Connector not found.");
    if (args.enabled && !process.env.BRIGHT_DATA_API_TOKEN) throwValidation("Bright Data API token is not configured.");
    await ctx.db.patch(args.connectorId, { enabled: args.enabled, updatedAt: Date.now() });
    return args.connectorId;
  },
});

/**
 * Lists connectors for the organization.
 */
export const listConnectors = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrganization(ctx);
    return await ctx.db.query("sourceConnectors").withIndex("by_organization", (q) => q.eq("organizationId", auth.organizationId)).collect();
  },
});

/**
 * Gets a single connector by id.
 */
export const getConnector = query({
  args: { connectorId: v.id("sourceConnectors") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const doc = await ctx.db.get(args.connectorId);
    if (!doc || doc.organizationId !== auth.organizationId) return null;
    return doc;
  },
});
