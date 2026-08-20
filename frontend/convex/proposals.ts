/**
 * Proposal project, outline hierarchy, assignments, comments, approval states.
 * Generates outline from cited instruction/evaluation clauses, enforces bid-manager
 * approval, prevents edits to locked revisions, progresses via explicit states.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOrganization } from "./lib/authorization";
import { throwConflict, throwForbidden, throwNotFound, throwValidation } from "./lib/errors";

/** Explicit proposal section states — progress is derived from these only. */
export const SECTION_STATES = ["NOT_STARTED","DRAFTING","READY_FOR_REVIEW","CHANGES_REQUESTED","APPROVED","LOCKED"] as const;
export type SectionState = typeof SECTION_STATES[number];
const TRANSITIONS: Record<SectionState, SectionState[]> = {
  NOT_STARTED: ["DRAFTING"],
  DRAFTING: ["READY_FOR_REVIEW"],
  READY_FOR_REVIEW: ["CHANGES_REQUESTED","APPROVED"],
  CHANGES_REQUESTED: ["DRAFTING"],
  APPROVED: ["LOCKED"],
  LOCKED: [],
};
/** Validates a state transition against the explicit graph. */
export function isValidTransition(from: SectionState, to: SectionState): boolean { return (TRANSITIONS[from] ?? []).includes(to); }
/** Returns true when editing is allowed (not locked). */
export function canEdit(state: SectionState, lockedRevision?: number): boolean { return state !== "LOCKED" && lockedRevision === undefined; }
/** Computes explicit progress without AI heuristics. */
export function computeProgress(sections: { state: SectionState }[]): { total: number; counts: Record<string, number>; percentApproved: number } {
  const counts: Record<string, number> = {}; for (const s of SECTION_STATES) counts[s]=0;
  for (const sec of sections) counts[sec.state] = (counts[sec.state] ?? 0)+1;
  const total = sections.length; const approved = (counts["APPROVED"]??0)+(counts["LOCKED"]??0);
  return { total, counts, percentApproved: total ? Math.round((approved/total)*10000)/100 : 0 };
}
/** Infers level from numeric prefix (1, 1.1, 2.3.1). */
function inferLevel(title: string): number {
  const prefix = title.trim().split(" ")[0] ?? "";
  if (prefix.includes(".") && prefix.split(".").every((p)=>/^\d+$/.test(p))) return Math.min(prefix.split(".").length, 4);
  return 1;
}
/** Builds outline sections from cited clauses with hierarchy. */
export function buildOutlineSections(clauses: { title: string; citation: string }[]): { title: string; citation: string; order: number; parentOrder: number | null; level: number }[] {
  if (clauses.length===0) throwValidation("At least one clause is required.");
  for (const c of clauses) if (!c.citation || !c.citation.trim()) throwValidation("Every outline heading requires a cited instruction or evaluation clause.");
  const out: { title: string; citation: string; order: number; parentOrder: number | null; level: number }[] = [];
  const lastAtLevel = new Map<number, number>();
  clauses.forEach((c, idx)=>{
    const level = inferLevel(c.title); const parentOrder = level>1 ? (lastAtLevel.get(level-1) ?? null) : null;
    out.push({ title: c.title.trim(), citation: c.citation.trim(), order: idx, parentOrder, level }); lastAtLevel.set(level, idx);
  });
  return out;
}

/**
 * Creates a proposal project for an opportunity/company pair.
 */
export const createProposal = mutation({
  args: { opportunityId: v.id("opportunities"), companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const now = Date.now();
    const id = await ctx.db.insert("proposalProjects", { organizationId: auth.organizationId, opportunityId: args.opportunityId, companyId: args.companyId, stage: "draft", ownerId: auth.clerkUserId, createdAt: now, updatedAt: now });
    await ctx.db.insert("auditEvents", { organizationId: auth.organizationId, actorId: auth.clerkUserId, action: "proposal.created", targetType: "proposalProjects", targetId: String(id), traceId: String(id), createdAt: now });
    return { id };
  },
});

/** Lists proposals for the caller's organization. */
export const listProposals = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrganization(ctx);
    return await ctx.db.query("proposalProjects").withIndex("by_organization", (q)=>q.eq("organizationId", auth.organizationId)).collect();
  },
});

/** Returns a proposal with its outline, assignments, comments, and progress. */
export const getProposal = query({
  args: { proposalId: v.id("proposalProjects") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.organizationId !== auth.organizationId) throwNotFound("Proposal not found.");
    const sections = await ctx.db.query("proposalSections").withIndex("by_organization_and_id", (q)=>q.eq("organizationId", auth.organizationId).eq("proposalId", args.proposalId)).collect();
    const comments = await ctx.db.query("proposalComments").withIndex("by_organization_and_id", (q)=>q.eq("organizationId", auth.organizationId).eq("proposalId", args.proposalId)).collect();
    sections.sort((a,b)=>a.order-b.order);
    return { proposal, sections, comments, progress: computeProgress(sections as { state: SectionState }[]) };
  },
});

/**
 * Generates an outline candidate from cited clauses and inserts sections.
 * Requires bid-manager or admin approval to create outline.
 */
export const generateOutline = mutation({
  args: { proposalId: v.id("proposalProjects"), clauses: v.array(v.object({ title: v.string(), citation: v.string(), kind: v.optional(v.string()) })) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (auth.role !== "org:bid_manager" && auth.role !== "org:admin") throwForbidden("Only bid manager may generate outline.");
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.organizationId !== auth.organizationId) throwNotFound("Proposal not found.");
    if (proposal.lockedRevision !== undefined) throwConflict("Proposal is locked.");
    const sections = buildOutlineSections(args.clauses as { title: string; citation: string }[]);
    const existing = await ctx.db.query("proposalSections").withIndex("by_organization_and_id", (q)=>q.eq("organizationId", auth.organizationId).eq("proposalId", args.proposalId)).collect();
    for (const s of existing) await ctx.db.delete(s._id);
    const now = Date.now(); const ids: string[] = [];
    for (let i=0;i<sections.length;i++) {
      const sec = sections[i];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parentId: any = sec.parentOrder !== null ? (ids[sec.parentOrder] as unknown) : undefined;
      const id = await ctx.db.insert("proposalSections", { organizationId: auth.organizationId, proposalId: args.proposalId, parentId: parentId as never, title: sec.title, instructionCitation: sec.citation, state: "NOT_STARTED", order: sec.order, createdAt: now });
      ids.push(String(id));
    }
    await ctx.db.patch(args.proposalId, { updatedAt: now });
    return { count: sections.length };
  },
});

/** Assigns a section to a user. */
export const assignSection = mutation({
  args: { sectionId: v.id("proposalSections"), assigneeId: v.string() },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const sec = await ctx.db.get(args.sectionId);
    if (!sec || sec.organizationId !== auth.organizationId) throwNotFound("Section not found.");
    if (!canEdit(sec.state as SectionState)) throwConflict("Locked section cannot be reassigned.");
    await ctx.db.patch(args.sectionId, { assigneeId: args.assigneeId });
    return { ok: true as const };
  },
});

/** Updates section body and optionally transitions state with validation. */
export const updateSection = mutation({
  args: { sectionId: v.id("proposalSections"), body: v.optional(v.string()), nextState: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const sec = await ctx.db.get(args.sectionId);
    if (!sec || sec.organizationId !== auth.organizationId) throwNotFound("Section not found.");
    const proposal = await ctx.db.get(sec.proposalId);
    if (proposal && proposal.lockedRevision !== undefined) throwConflict("Proposal is locked.");
    if (!canEdit(sec.state as SectionState)) throwConflict("Locked section cannot be edited.");
    if (args.nextState !== undefined) {
      const next = args.nextState as SectionState;
      if (!(SECTION_STATES as readonly string[]).includes(next)) throwValidation("Invalid section state.");
      if (!isValidTransition(sec.state as SectionState, next)) throwValidation(`Invalid transition ${sec.state} -> ${next}.`);
      if ((next === "APPROVED" || next === "LOCKED") && auth.role !== "org:bid_manager" && auth.role !== "org:admin") throwForbidden("Only bid manager may approve or lock.");
    }
    const patch: Record<string, unknown> = {};
    if (args.body !== undefined) patch["body"] = args.body;
    if (args.nextState !== undefined) patch["state"] = args.nextState;
    if (Object.keys(patch).length) await ctx.db.patch(args.sectionId, patch);
    return { ok: true as const };
  },
});

/** Adds a threaded comment with optional anchor and resolution state. */
export const addComment = mutation({
  args: { proposalId: v.id("proposalProjects"), sectionId: v.optional(v.id("proposalSections")), body: v.string(), anchor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.organizationId !== auth.organizationId) throwNotFound("Proposal not found.");
    if (!args.body.trim()) throwValidation("Comment body is required.");
    const id = await ctx.db.insert("proposalComments", { organizationId: auth.organizationId, proposalId: args.proposalId, sectionId: args.sectionId, authorId: auth.clerkUserId, body: args.body.trim(), anchor: args.anchor, resolutionState: "open", createdAt: Date.now() });
    return { id };
  },
});

/** Locks a proposal revision and all sections — requires bid manager. */
export const lockProposal = mutation({
  args: { proposalId: v.id("proposalProjects") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (auth.role !== "org:bid_manager" && auth.role !== "org:admin") throwForbidden("Only bid manager may lock proposal.");
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.organizationId !== auth.organizationId) throwNotFound("Proposal not found.");
    const sections = await ctx.db.query("proposalSections").withIndex("by_organization_and_id", (q)=>q.eq("organizationId", auth.organizationId).eq("proposalId", args.proposalId)).collect();
    for (const s of sections) if (s.state !== "LOCKED") await ctx.db.patch(s._id, { state: "LOCKED" });
    const rev = Date.now();
    await ctx.db.patch(args.proposalId, { lockedRevision: rev, updatedAt: rev });
    return { lockedRevision: rev };
  },
});
