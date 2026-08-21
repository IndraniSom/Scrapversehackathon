/**
 * Official document handling with allowlisted fetch and authority gating.
 *
 * Only `official` documents from allowlisted gov portals may be queued.
 * Every new or changed URL is validated before acquisition is scheduled.
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrganization } from "./lib/authorization";
import { throwNotFound, throwValidation } from "./lib/errors";

/** Hosts permitted for official document acquisition. */
const ALLOWED_HOSTS = new Set([
  "www.eprocure.gov.in",
  "eprocure.gov.in",
  "wbtenders.gov.in",
  "www.wbtenders.gov.in",
  "ntpctender.ntpc.co.in",
  "odisha.gov.in",
  "www.odisha.gov.in",
]);

/**
 * Return true when the URL is https, credential-free, and host-allowlisted.
 * Rejects private, non-https, or untrusted domains before any fetch is queued.
 */
export function isAllowlistedDocumentUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    if (parsed.port) return false;
    if (parsed.search && parsed.search.includes("..")) return false;
    return ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Infer authority from URL allowlist and requested role.
 * Official requires allowlisted https host; otherwise unofficial.
 */
export function authorityForUrl(url: string): "official" | "unofficial" {
  return isAllowlistedDocumentUrl(url) ? "official" : "unofficial";
}

/**
 * Validate that a document role and URL pair is eligible for queuing.
 * Corrigendum and clarification require an official authority source.
 */
export function isEligibleForQueue(role: string, url: string): boolean {
  if (!isAllowlistedDocumentUrl(url)) return false;
  return true;
}

/** Queue one official document fetch after allowlist validation. */
export const queueOfficialDocument = mutation({
  args: {
    opportunityId: v.id("opportunities"),
    url: v.string(),
    role: v.string(),
    digest: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganization(ctx);
    if (!isAllowlistedDocumentUrl(args.url)) throwValidation("document URL is not allowlisted");
    const opportunity = await ctx.db.get(args.opportunityId);
    if (!opportunity || opportunity.organizationId !== organizationId) throwNotFound("Opportunity not found.");
    const existing = await ctx.db
      .query("opportunityDocuments")
      .withIndex("by_organization_and_id", (q) => q.eq("organizationId", organizationId).eq("opportunityId", args.opportunityId))
      .collect();
    const duplicate = existing.find((d) => d.url === args.url && d.digest === args.digest);
    if (duplicate) return { documentId: duplicate._id, queued: false };
    const documentId = await ctx.db.insert("opportunityDocuments", {
      authority: "official",
      createdAt: Date.now(),
      digest: args.digest,
      opportunityId: args.opportunityId,
      organizationId,
      role: args.role,
      url: args.url,
    });
    // Link corrigendum relationship when role indicates amendment.
    if (args.role === "corrigendum" || args.role === "clarification") {
      await ctx.db.insert("opportunityRelationships", {
        createdAt: Date.now(),
        kind: args.role as "corrigendum" | "clarification",
        organizationId,
        sourceOpportunityId: args.opportunityId,
        status: "confirmed",
        targetOpportunityId: args.opportunityId,
      });
    }
    return { documentId, queued: true };
  },
});

/** List documents for an opportunity with tenant check. */
export const listDocuments = query({
  args: { opportunityId: v.id("opportunities") },
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganization(ctx);
    const opportunity = await ctx.db.get(args.opportunityId);
    if (!opportunity || opportunity.organizationId !== organizationId) throwNotFound("Opportunity not found.");
    const docs = await ctx.db
      .query("opportunityDocuments")
      .withIndex("by_organization_and_id", (q) => q.eq("organizationId", organizationId).eq("opportunityId", args.opportunityId))
      .collect();
    return docs;
  },
});

/** Fetch one document by id with tenant isolation. */
export const getDocument = query({
  args: { documentId: v.id("opportunityDocuments") },
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganization(ctx);
    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.organizationId !== organizationId) throwNotFound("Document not found.");
    return doc;
  },
});
