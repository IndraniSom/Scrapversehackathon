/**
 * Approved content library with immutable revisions and permission scope.
 *
 * States draft/review/approved/expired; revisions never mutate approved text
 * directly. Freshness creates review tasks instead of auto-editing.
 * Tenant-isolated via requireOrganization; viewers see approved only.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOrganization, requirePermission } from "./lib/authorization";
import { throwConflict, throwNotFound, throwValidation } from "./lib/errors";
import { canTransition, isDuplicateTitle } from "./lib/contentLibraryHelpers";
import type { ContentStatus } from "./lib/contentLibraryHelpers";

/**
 * Lists entries scoped by role: viewers see approved only.
 */
export const listEntries = query({
  args: { status: v.optional(v.union(v.literal("draft"), v.literal("review"), v.literal("approved"), v.literal("expired"))), capabilityArea: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const base = await ctx.db.query("contentEntries").withIndex("by_organization", (q) => q.eq("organizationId", auth.organizationId)).collect();
    let filtered = base;
    if (auth.role === "org:viewer") filtered = filtered.filter((e) => e.status === "approved");
    if (args.status) filtered = filtered.filter((e) => e.status === args.status);
    if (args.capabilityArea) filtered = filtered.filter((e) => e.capabilityArea === args.capabilityArea);
    return filtered;
  },
});

/**
 * Gets one entry with tenant check.
 */
export const getEntry = query({
  args: { entryId: v.id("contentEntries") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const entry = await ctx.db.get(args.entryId);
    if (!entry || entry.organizationId !== auth.organizationId) throwNotFound();
    if (auth.role === "org:viewer" && entry.status !== "approved") throwNotFound();
    return entry;
  },
});

/**
 * Creates a draft entry; rejects duplicate titles.
 */
export const createEntry = mutation({
  args: { title: v.string(), body: v.string(), tags: v.optional(v.array(v.string())), categories: v.optional(v.array(v.string())), capabilityArea: v.optional(v.string()), citations: v.optional(v.array(v.string())), reviewCadenceDays: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (auth.role === "org:viewer") throwValidation("Viewers cannot create content.");
    if (!args.title.trim() || !args.body.trim()) throwValidation("Title and body are required.");
    const existing = await ctx.db.query("contentEntries").withIndex("by_organization", (q) => q.eq("organizationId", auth.organizationId)).collect();
    if (isDuplicateTitle(args.title, existing.map((e) => e.title))) throwConflict("Duplicate title in organization.");
    const now = Date.now();
    const id = await ctx.db.insert("contentEntries", {
      organizationId: auth.organizationId,
      title: args.title.trim(),
      body: args.body,
      tags: args.tags,
      categories: args.categories,
      capabilityArea: args.capabilityArea,
      citations: args.citations,
      ownerId: auth.clerkUserId,
      reviewCadenceDays: args.reviewCadenceDays,
      status: "draft",
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("contentEntryRevisions", { organizationId: auth.organizationId, entryId: id, body: args.body, citations: args.citations, status: "draft", createdAt: now });
    return id;
  },
});

/**
 * Updates a draft by adding an immutable revision; approved requires review cycle.
 */
export const updateEntry = mutation({
  args: { entryId: v.id("contentEntries"), body: v.string(), citations: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const entry = await ctx.db.get(args.entryId);
    if (!entry || entry.organizationId !== auth.organizationId) throwNotFound();
    if (entry.status === "approved" || entry.status === "expired") throwValidation("Approved content cannot be edited directly; create a new draft revision.");
    if (!args.body.trim()) throwValidation("Body required.");
    await ctx.db.patch(args.entryId, { body: args.body, citations: args.citations, updatedAt: Date.now() });
    await ctx.db.insert("contentEntryRevisions", { organizationId: auth.organizationId, entryId: args.entryId, body: args.body, citations: args.citations, status: entry.status, createdAt: Date.now() });
    return args.entryId;
  },
});

/**
 * Moves entry through allowed transitions with role checks.
 */
export const transitionStatus = mutation({
  args: { entryId: v.id("contentEntries"), toStatus: v.union(v.literal("draft"), v.literal("review"), v.literal("approved"), v.literal("expired")) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const entry = await ctx.db.get(args.entryId);
    if (!entry || entry.organizationId !== auth.organizationId) throwNotFound();
    const from = entry.status as ContentStatus;
    const to = args.toStatus as ContentStatus;
    if (!canTransition(from, to)) throwValidation(`Cannot transition ${from} to ${to}.`);
    if (to === "approved" && auth.role !== "org:admin" && auth.role !== "org:reviewer") throwValidation("Only reviewer or admin can approve.");
    await ctx.db.patch(args.entryId, { status: to, updatedAt: Date.now() });
    await ctx.db.insert("contentEntryRevisions", { organizationId: auth.organizationId, entryId: args.entryId, body: entry.body, citations: (entry as unknown as { citations?: string[] }).citations, status: to, createdAt: Date.now() });
    return args.entryId;
  },
});

/**
 * Rolls back to a prior revision by creating a new immutable revision.
 */
export const rollbackRevision = mutation({
  args: { entryId: v.id("contentEntries"), revisionId: v.id("contentEntryRevisions") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    await requirePermission(ctx, "org:bid_manager");
    const entry = await ctx.db.get(args.entryId);
    const revision = await ctx.db.get(args.revisionId);
    if (!entry || entry.organizationId !== auth.organizationId) throwNotFound();
    if (!revision || revision.entryId !== args.entryId) throwNotFound();
    await ctx.db.patch(args.entryId, { body: revision.body, citations: revision.citations, updatedAt: Date.now() });
    await ctx.db.insert("contentEntryRevisions", { organizationId: auth.organizationId, entryId: args.entryId, body: revision.body, citations: revision.citations, status: entry.status, createdAt: Date.now() });
    return args.entryId;
  },
});

/**
 * Proposes an approved proposal section back into library as draft review.
 */
export const proposeFromProposal = mutation({
  args: { title: v.string(), body: v.string(), capabilityArea: v.optional(v.string()), citations: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (!args.title.trim() || !args.body.trim()) throwValidation("Title and body required.");
    const now = Date.now();
    const id = await ctx.db.insert("contentEntries", {
      organizationId: auth.organizationId,
      title: args.title.trim(),
      body: args.body,
      capabilityArea: args.capabilityArea,
      citations: args.citations,
      ownerId: auth.clerkUserId,
      status: "review",
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("contentEntryRevisions", { organizationId: auth.organizationId, entryId: id, body: args.body, citations: args.citations, status: "review", createdAt: now });
    return id;
  },
});

/**
 * Detects stale approved entries and creates review tasks without mutating content.
 */
export const runFreshnessReview = mutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    await requirePermission(ctx, "org:admin");
    const now = args.now ?? Date.now();
    const entries = await ctx.db.query("contentEntries").withIndex("by_organization_status", (q) => q.eq("organizationId", auth.organizationId).eq("status", "approved")).collect();
    let created = 0;
    for (const entry of entries) {
      const cadence = (entry as unknown as { reviewCadenceDays?: number }).reviewCadenceDays ?? 90;
      const ageDays = (now - entry.updatedAt) / 86_400_000;
      const body: string = entry.body ?? "";
      const staleMarkers = ["discontinued", "deprecated", "legacy product", "former employee"];
      const hasStaleMarker = staleMarkers.some((m) => body.toLowerCase().includes(m));
      if (ageDays > cadence || hasStaleMarker) {
        await ctx.db.insert("reviewTasks", { organizationId: auth.organizationId, targetType: "contentEntry", targetId: entry._id, priority: "medium", state: "open", createdAt: now });
        created++;
      }
    }
    return { reviewed: entries.length, stale: created };
  },
});
