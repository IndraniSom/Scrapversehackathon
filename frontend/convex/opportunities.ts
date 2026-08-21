/**
 * Versioned opportunity writes with stable identity and immutable digests.
 *
 * Stable source key is `source:sourceTenderId`. A new version is inserted
 * only when the canonical digest changes; historical versions are never mutated.
 */
import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrganization } from "./lib/authorization";
import { throwNotFound, throwValidation } from "./lib/errors";

/** Allowlisted modes preserved in every view. */
const DATA_MODES = ["LIVE", "RECORDED_BRIGHT_DATA_SNAPSHOT", "MANUAL_FIXTURE"] as const;

/**
 * Build the stable source key from portal source and tender identifier.
 * Used to locate an existing opportunity before version comparison.
 */
export function stableSourceKey(source: string, sourceTenderId: string): string {
  return `${source}:${sourceTenderId}`;
}

/**
 * Hash a string to hex using FNV-1a; deterministic without async crypto.
 * Produces stable output for version digests in tests and Convex runtime.
 */
function hashString(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Compute an immutable version digest from canonical normalized fields.
 * Includes title, authority, dates, canonicalUrl, and sorted document hashes.
 */
export function canonicalDigest(input: {
  source: string;
  sourceTenderId: string;
  title: string;
  authority: string;
  referenceNumber?: string | null;
  category?: string | null;
  publishedAt?: number | null;
  closesAt?: number | null;
  canonicalUrl?: string | null;
  documentHashes?: string[];
}): string {
  const payload = {
    authority: input.authority.trim(),
    canonicalUrl: input.canonicalUrl ?? "",
    category: input.category ?? "",
    closesAt: input.closesAt ?? null,
    documentHashes: [...(input.documentHashes ?? [])].sort(),
    publishedAt: input.publishedAt ?? null,
    referenceNumber: input.referenceNumber ?? "",
    source: input.source,
    sourceTenderId: input.sourceTenderId,
    title: input.title.trim(),
  };
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return hashString(canonical) + hashString(canonical.split("").reverse().join(""));
}

/**
 * Return true when the new digest differs and a new immutable version is required.
 */
export function shouldCreateNewVersion(existingDigest: string | null, newDigest: string): boolean {
  if (!existingDigest) return true;
  return existingDigest !== newDigest;
}

/** Upsert one opportunity and insert a new immutable version only on digest change. */
export const upsertOpportunity = internalMutation({
  args: {
    organizationId: v.string(),
    source: v.string(),
    sourceTenderId: v.string(),
    title: v.string(),
    authority: v.string(),
    referenceNumber: v.optional(v.string()),
    category: v.optional(v.string()),
    closesAt: v.optional(v.number()),
    publishedAt: v.optional(v.number()),
    canonicalUrl: v.optional(v.string()),
    dataMode: v.union(v.literal("LIVE"), v.literal("RECORDED_BRIGHT_DATA_SNAPSHOT"), v.literal("MANUAL_FIXTURE")),
    snapshotId: v.id("sourceSnapshots"),
    documentHashes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    if (!args.source || !args.sourceTenderId) throwValidation("source and sourceTenderId are required");
    if (!DATA_MODES.includes(args.dataMode as (typeof DATA_MODES)[number])) throwValidation("invalid dataMode");
    const digest = canonicalDigest({
      authority: args.authority,
      canonicalUrl: args.canonicalUrl,
      category: args.category,
      closesAt: args.closesAt ?? null,
      documentHashes: args.documentHashes,
      publishedAt: args.publishedAt ?? null,
      referenceNumber: args.referenceNumber,
      source: args.source,
      sourceTenderId: args.sourceTenderId,
      title: args.title,
    });
    const existing = await ctx.db
      .query("opportunities")
      .withIndex("by_organization_and_id", (q) => q.eq("organizationId", args.organizationId).eq("sourceTenderId", args.sourceTenderId))
      .collect();
    const matched = existing.find((o) => o.source === args.source) ?? null;
    if (!matched) {
      const opportunityId = await ctx.db.insert("opportunities", {
        authority: args.authority,
        canonicalUrl: args.canonicalUrl,
        category: args.category,
        closesAt: args.closesAt,
        lifecycle: "open",
        organizationId: args.organizationId,
        dataMode: args.dataMode,
        publishedAt: args.publishedAt,
        referenceId: args.referenceNumber,
        source: args.source,
        sourceTenderId: args.sourceTenderId,
        title: args.title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const versionId = await ctx.db.insert("opportunityVersions", {
        contentDigest: digest,
        createdAt: Date.now(),
        dataMode: args.dataMode,
        normalizedData: JSON.stringify({ title: args.title, closesAt: args.closesAt }),
        opportunityId,
        organizationId: args.organizationId,
        sourceSnapshotId: args.snapshotId,
      });
      await ctx.db.patch(opportunityId, { currentVersionId: versionId, updatedAt: Date.now() });
      return { opportunityId, versionId, created: true };
    }
    const currentVersion = matched.currentVersionId ? await ctx.db.get(matched.currentVersionId) : null;
    if (currentVersion && currentVersion.contentDigest === digest) {
      return { opportunityId: matched._id, versionId: currentVersion._id, created: false };
    }
    const versionId = await ctx.db.insert("opportunityVersions", {
      contentDigest: digest,
      createdAt: Date.now(),
      dataMode: args.dataMode,
      normalizedData: JSON.stringify({ title: args.title, closesAt: args.closesAt }),
      opportunityId: matched._id,
      organizationId: args.organizationId,
      sourceSnapshotId: args.snapshotId,
    });
    await ctx.db.patch(matched._id, { currentVersionId: versionId, updatedAt: Date.now(), title: args.title, authority: args.authority, closesAt: args.closesAt, canonicalUrl: args.canonicalUrl, dataMode: args.dataMode, publishedAt: args.publishedAt });
    return { opportunityId: matched._id, versionId, created: true };
  },
});

/** Fetch one opportunity by id with tenant scoping. */
export const getOpportunity = query({
  args: { opportunityId: v.id("opportunities") },
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganization(ctx);
    const doc = await ctx.db.get(args.opportunityId);
    if (!doc || doc.organizationId !== organizationId) throwNotFound("Opportunity not found.");
    return doc;
  },
});

/** List opportunities for an organization with optional source filter. */
export const listOpportunities = query({
  args: { source: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganization(ctx);
    const q = ctx.db.query("opportunities").withIndex("by_organization", (qb) => qb.eq("organizationId", organizationId));
    const all = await q.collect();
    return args.source ? all.filter((o) => o.source === args.source) : all;
  },
});
