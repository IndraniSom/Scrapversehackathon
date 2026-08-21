/**
 * Compliance matrix, gap categories, approval block and CSV export.
 * Deterministic rows are seeded from accepted requirements before AI grouping.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { throwDomainError } from "./lib/errors";

/** Gap categories for procurement compliance review. */
export const GAP_CATEGORIES = ["MISSING_DATA","MISSING_DOCUMENT","FAILED_REQUIREMENT","UNKNOWN_SEMANTICS","OWNER_REQUIRED","REVIEW_REQUIRED"] as const;
export type GapCategory = typeof GAP_CATEGORIES[number];
export type ComplianceRow = { requirementId: string; citation: string; responseLocation?: string; evidence?: string; ownerId?: string; status: "pending"|"compliant"|"gap"; gapCategory?: GapCategory; isMandatory: boolean; requirementRevision: number; organizationId: string; };
export type ComplianceRequirement = { id: string; citation: string; organizationId: string; revision: number; isMandatory: boolean; evaluation?: "PASS"|"FAIL"|"UNKNOWN"|"NOT_APPLICABLE"; };
export type AmbiguityCandidate = { requirementA: string; requirementB: string; citationA: string; citationB: string; reason: string; disposition: "open"|"accepted"|"rejected"; };

/** Seeds deterministic rows sorted by requirement id before AI grouping. */
export function buildComplianceRows(requirements: ComplianceRequirement[], organizationId: string, currentRevision?: number): ComplianceRow[] {
  if (!organizationId) throw new Error("organizationId is required");
  const seen = new Set<string>();
  for (const r of requirements) {
    if (r.organizationId !== organizationId) throw new Error("cross-tenant requirement is not allowed");
    if (seen.has(r.id)) throw new Error(`duplicate requirement id: ${r.id}`);
    seen.add(r.id);
  }
  return [...requirements].sort((a,b)=>a.id.localeCompare(b.id)).map((req)=> {
    const gap = initialGap(req, currentRevision);
    return { requirementId: req.id, citation: req.citation, status: gap ? "gap" : "pending", gapCategory: gap, isMandatory: req.isMandatory, requirementRevision: req.revision, organizationId } as ComplianceRow;
  });
}

/** Classifies one row into a gap category using deterministic precedence. */
export function classifyGap(row: ComplianceRow, evaluation?: string): GapCategory | undefined {
  if (row.gapCategory === "REVIEW_REQUIRED") return "REVIEW_REQUIRED";
  if (!row.responseLocation) return row.isMandatory ? "MISSING_DATA" : "REVIEW_REQUIRED";
  if (!row.evidence) return "MISSING_DOCUMENT";
  if (!row.ownerId && row.isMandatory) return "OWNER_REQUIRED";
  if (evaluation === "FAIL") return "FAILED_REQUIREMENT";
  if (evaluation === "UNKNOWN") return "UNKNOWN_SEMANTICS";
  if (row.status === "gap" && row.gapCategory) return row.gapCategory;
  return undefined;
}

/** Returns true while mandatory rows lack response or evidence and blocks approval. */
export function isApprovalBlocked(rows: ComplianceRow[]): boolean {
  for (const r of rows) {
    if (!r.isMandatory) continue;
    if (!r.responseLocation || !r.evidence) return true;
    if (r.status !== "compliant") return true;
    if (classifyGap(r)) return true;
  }
  return false;
}

/** Exports deterministic CSV with header and escaped fields for submission package. */
export function exportComplianceCsv(rows: ComplianceRow[]): string {
  const header = ["requirement_id","citation","response_location","evidence","owner_id","status","gap_category","is_mandatory"];
  const esc = (v: string) => (v.includes(",")||v.includes('"')||v.includes("\n")||v.includes("\r") ? `"${v.replaceAll('"','""')}"` : v);
  const lines = [header.join(",")];
  for (const row of [...rows].sort((a,b)=>a.requirementId.localeCompare(b.requirementId))) {
    lines.push([esc(row.requirementId),esc(row.citation),esc(row.responseLocation??""),esc(row.evidence??""),esc(row.ownerId??""),row.status,row.gapCategory??"",String(row.isMandatory)].join(","));
  }
  return lines.join("\n")+"\n";
}

/** Returns citations that appear for more than one requirement. */
export function detectDuplicateClauses(requirements: ComplianceRequirement[]): string[] {
  const counts = new Map<string,number>();
  for (const r of requirements) counts.set(r.citation,(counts.get(r.citation)??0)+1);
  return [...counts.entries()].filter(([,n])=>n>1).map(([c])=>c).sort();
}

/** Returns paired ids that share a citation and need conflict review. */
export function detectConflictingRequirements(requirements: ComplianceRequirement[]): [string,string][] {
  const out: [string,string][] = [];
  for (let i=0;i<requirements.length;i++) for (let j=i+1;j<requirements.length;j++) if (requirements[i].citation===requirements[j].citation && requirements[i].id!==requirements[j].id) out.push([requirements[i].id,requirements[j].id]);
  return out;
}

/** Returns true when a row revision is stale against the current amendment revision. */
export function isStaleRequirement(requirementRevision: number, currentRevision: number): boolean { return requirementRevision < currentRevision; }

/** Proposes AI grouping after deterministic seeding without mutating row order. */
export function proposeAiGrouping(rows: ComplianceRow[]): Record<string,string[]> {
  const groups: Record<string,string[]> = {};
  for (const row of rows) { const key = row.citation.split(" ")[0] || "uncategorized"; (groups[key] ??= []).push(row.requirementId); }
  return groups;
}

/** Validates tenant isolation for a requirement before row creation. */
export function validateTenant(rowOrganizationId: string, requirementOrganizationId: string): void {
  if (rowOrganizationId !== requirementOrganizationId) throwDomainError("FORBIDDEN","Cross-tenant evidence is not allowed.");
}

/** Extracts organizationId from Convex identity with tenant check. */
function orgIdFromIdentity(identity: unknown): string {
  const id = (identity as { orgId?: string; organizationId?: string })?.orgId ?? (identity as { organizationId?: string })?.organizationId ?? "";
  if (!id) throwDomainError("FORBIDDEN","Organization context is required.");
  return id;
}

/** Maps stored rows to typed ComplianceRow for approval and export checks. */
function mapRows(rows: { requirementId: unknown; responseLocation?: string | null; evidence?: string | null; ownerId?: string | null; status: "pending"|"compliant"|"gap"; organizationId: string }[]): ComplianceRow[] {
  return rows.map((r)=>({ requirementId: String(r.requirementId), citation: "", responseLocation: r.responseLocation??undefined, evidence: r.evidence??undefined, ownerId: r.ownerId??undefined, status: r.status, isMandatory: true, requirementRevision: 1, organizationId: r.organizationId }));
}

/** Lists compliance rows for a proposal with tenant authorization. */
export const listComplianceRows = query({
  args: { proposalId: v.id("proposalProjects") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity(); if (!identity) throwDomainError("UNAUTHORIZED","Authentication required.");
    const orgId = orgIdFromIdentity(identity);
    return await ctx.db.query("complianceRows").withIndex("by_organization_and_id",(q)=>q.eq("organizationId",orgId).eq("proposalId",args.proposalId)).collect();
  },
});

/** Checks if approval is blocked for a proposal's mandatory rows. */
export const checkApprovalBlocked = query({
  args: { proposalId: v.id("proposalProjects") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity(); if (!identity) throwDomainError("UNAUTHORIZED","Authentication required.");
    const orgId = orgIdFromIdentity(identity);
    const rows = await ctx.db.query("complianceRows").withIndex("by_organization_and_id",(q)=>q.eq("organizationId",orgId).eq("proposalId",args.proposalId)).collect();
    return isApprovalBlocked(mapRows(rows as unknown as never));
  },
});

/** Exports compliance CSV for the submission package. */
export const exportComplianceCsvQuery = query({
  args: { proposalId: v.id("proposalProjects") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity(); if (!identity) throwDomainError("UNAUTHORIZED","Authentication required.");
    const orgId = orgIdFromIdentity(identity);
    const rows = await ctx.db.query("complianceRows").withIndex("by_organization_and_id",(q)=>q.eq("organizationId",orgId).eq("proposalId",args.proposalId)).collect();
    return exportComplianceCsv(mapRows(rows as unknown as never));
  },
});

/** Upserts a compliance row response with tenant check. */
export const upsertComplianceRow = mutation({
  args: { proposalId: v.id("proposalProjects"), requirementId: v.id("requirements"), responseLocation: v.optional(v.string()), evidence: v.optional(v.string()), ownerId: v.optional(v.string()), status: v.union(v.literal("pending"),v.literal("compliant"),v.literal("gap")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity(); if (!identity) throwDomainError("UNAUTHORIZED","Authentication required.");
    const orgId = orgIdFromIdentity(identity);
    const existing = await ctx.db.query("complianceRows").withIndex("by_organization_and_id",(q)=>q.eq("organizationId",orgId).eq("proposalId",args.proposalId)).collect();
    const dup = existing.find((r)=>String(r.requirementId)===String(args.requirementId));
    if (dup) await ctx.db.patch(dup._id,{ responseLocation: args.responseLocation, evidence: args.evidence, ownerId: args.ownerId, status: args.status });
    else await ctx.db.insert("complianceRows",{ organizationId: orgId, proposalId: args.proposalId, requirementId: args.requirementId, responseLocation: args.responseLocation, evidence: args.evidence, ownerId: args.ownerId, status: args.status, createdAt: Date.now() });
    return null;
  },
});

/** Infers initial gap before human input for deterministic seeding. */
function initialGap(req: ComplianceRequirement, currentRevision?: number): GapCategory | undefined {
  if (currentRevision!==undefined && req.revision < currentRevision) return "REVIEW_REQUIRED";
  if (req.evaluation==="FAIL") return "FAILED_REQUIREMENT";
  if (req.evaluation==="UNKNOWN") return "UNKNOWN_SEMANTICS";
  return undefined;
}
