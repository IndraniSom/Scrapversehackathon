/**
 * Compliance matrix, gap categories, approval block and CSV export.
 * Deterministic rows are seeded from accepted requirements before AI grouping.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireOrganization } from "./lib/authorization";
import { throwDomainError, throwNotFound } from "./lib/errors";

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

/** Loads enriched compliance rows after proposal and requirement ownership checks. */
async function loadRows(ctx: QueryCtx, organizationId: string, proposalId: Id<"proposalProjects">): Promise<ComplianceRow[]> {
  const proposal = await ctx.db.get(proposalId);
  if (!proposal || proposal.organizationId !== organizationId) throwNotFound("Proposal not found.");
  const stored = await ctx.db.query("complianceRows").withIndex("by_organization_and_id",(q)=>q.eq("organizationId",organizationId).eq("proposalId",proposalId)).collect();
  const rows: ComplianceRow[] = [];
  for (const row of stored) {
    const requirement = await ctx.db.get(row.requirementId);
    if (!requirement || requirement.organizationId !== organizationId) continue;
    const span = requirement.evidenceSpans?.[0];
    const citation = span ? `Page ${span.page}: ${span.text}` : `Requirement ${String(row.requirementId)}`;
    const mapped: ComplianceRow = { requirementId: String(row.requirementId), citation, responseLocation: row.responseLocation, evidence: row.evidence, ownerId: row.ownerId, status: row.status, isMandatory: requirement.hardness === "hard", requirementRevision: requirement.revision, organizationId };
    mapped.gapCategory = classifyGap(mapped);
    rows.push(mapped);
  }
  return rows;
}

/** Lists compliance rows for a proposal with tenant authorization. */
export const listComplianceRows = query({
  args: { proposalId: v.id("proposalProjects") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    return loadRows(ctx, auth.organizationId, args.proposalId);
  },
});

/** Checks if approval is blocked for a proposal's mandatory rows. */
export const checkApprovalBlocked = query({
  args: { proposalId: v.id("proposalProjects") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    return isApprovalBlocked(await loadRows(ctx, auth.organizationId, args.proposalId));
  },
});

/** Exports compliance CSV for the submission package. */
export const exportComplianceCsvQuery = query({
  args: { proposalId: v.id("proposalProjects") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    return exportComplianceCsv(await loadRows(ctx, auth.organizationId, args.proposalId));
  },
});

/** Upserts a compliance row response with tenant check. */
export const upsertComplianceRow = mutation({
  args: { proposalId: v.id("proposalProjects"), requirementId: v.id("requirements"), responseLocation: v.optional(v.string()), evidence: v.optional(v.string()), ownerId: v.optional(v.string()), status: v.union(v.literal("pending"),v.literal("compliant"),v.literal("gap")) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const proposal = await ctx.db.get(args.proposalId);
    const requirement = await ctx.db.get(args.requirementId);
    if (!proposal || proposal.organizationId !== auth.organizationId || !requirement || requirement.organizationId !== auth.organizationId) throwNotFound("Proposal requirement not found.");
    const existing = await ctx.db.query("complianceRows").withIndex("by_organization_and_id",(q)=>q.eq("organizationId",auth.organizationId).eq("proposalId",args.proposalId)).collect();
    const dup = existing.find((r)=>String(r.requirementId)===String(args.requirementId));
    if (dup) await ctx.db.patch(dup._id,{ responseLocation: args.responseLocation, evidence: args.evidence, ownerId: args.ownerId, status: args.status });
    else await ctx.db.insert("complianceRows",{ organizationId: auth.organizationId, proposalId: args.proposalId, requirementId: args.requirementId, responseLocation: args.responseLocation, evidence: args.evidence, ownerId: args.ownerId, status: args.status, createdAt: Date.now() });
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
