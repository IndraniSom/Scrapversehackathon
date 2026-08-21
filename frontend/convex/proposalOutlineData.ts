/** Reviewed requirement loading for proposal outline generation. */
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/** Returns cited headings from newest approved requirement sets for one tender. */
export async function loadOutlineClauses(ctx: QueryCtx | MutationCtx, organizationId: string, opportunityId: Id<"opportunities">): Promise<Array<{ title: string; citation: string }>> {
  const documents = await ctx.db.query("opportunityDocuments").withIndex("by_organization_and_id", (query) => query.eq("organizationId", organizationId).eq("opportunityId", opportunityId)).collect();
  const clauses: Array<{ title: string; citation: string; revision: number }> = [];
  for (const document of documents) {
    const sets = await ctx.db.query("requirementSets").withIndex("by_organization_and_id", (query) => query.eq("organizationId", organizationId).eq("documentId", document._id)).collect();
    const accepted = sets.filter((set) => set.extractionState === "extracted" && set.reviewState === "approved").sort((left, right) => right.revision - left.revision)[0];
    if (!accepted) continue;
    const requirements = await ctx.db.query("requirements").withIndex("by_organization_and_id", (query) => query.eq("organizationId", organizationId).eq("requirementSetId", accepted._id)).collect();
    for (const requirement of requirements) {
      const span = requirement.evidenceSpans?.[0];
      if (span) clauses.push({ title: requirement.predicate.field.replaceAll("_", " "), citation: `Page ${span.page}: ${span.text.slice(0, 240)}`, revision: accepted.revision });
    }
  }
  return clauses.sort((left, right) => right.revision - left.revision).map((clause, index) => ({ title: `${index + 1}. ${clause.title}`, citation: clause.citation }));
}
