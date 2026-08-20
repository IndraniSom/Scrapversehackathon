/** Tenant-isolated company CRUD, evidence editors, and completeness counts. */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
const FY_PATTERN = /^\d{4}-\d{2}$/;
const INR_PATTERN = /^\d+(?:\.\d{1,2})?$/;
/** Validates FY YYYY-YY where YY is (YYYY+1)%100. */
export function isValidFinancialYear(v: string): boolean {
  if (!FY_PATTERN.test(v)) return false;
  const s = Number(v.slice(0, 4)), e = Number(v.slice(5, 7));
  return Number.isFinite(s) && Number.isFinite(e) && e === (s + 1) % 100;
}
/** Validates decimal INR >0 with up to 2 decimals. */
export function isValidInrAmount(v: string): boolean {
  return INR_PATTERN.test(v) && Number.isFinite(Number(v)) && Number(v) > 0;
}
/** Validates start < end when both present. */
export function isValidDateOrder(s?: number, e?: number): boolean {
  return s === undefined || e === undefined ? true : s < e;
}
/** Requires auth and matching organizationId; throws safe domain errors. */
export async function requireOrg(ctx: { auth: { getUserIdentity(): Promise<null | { subject: string; [k: string]: unknown }> } }, orgId: string): Promise<void> {
  const id = await ctx.auth.getUserIdentity();
  if (!id) throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required." });
  if (!orgId.trim()) throw new ConvexError({ code: "VALIDATION_FAILED", message: "organizationId required." });
  const tokenOrg = (id as Record<string, unknown>).organizationId as string | undefined;
  if (tokenOrg && tokenOrg !== orgId) throw new ConvexError({ code: "FORBIDDEN", message: "Cross-tenant access denied." });
}
/** Counts records missing evidenceDocumentId. */
function missing(records: Array<{ evidenceDocumentId?: string | null }>): number {
  return records.filter((r) => !r.evidenceDocumentId).length;
}
/** Lists active companies with completeness counts. */
export const listCompanies = query({
  args: { organizationId: v.string() },
  handler: async (ctx, a) => {
    await requireOrg(ctx, a.organizationId);
    const all = await ctx.db.query("companies").withIndex("by_organization", (q) => q.eq("organizationId", a.organizationId)).collect();
    const active = all.filter((c) => c.status === "active");
    return Promise.all(
      active.map(async (c) => {
        const [t, ce, p, ex] = await Promise.all([
          ctx.db.query("companyTurnover").withIndex("by_organization_and_id", (q) => q.eq("organizationId", a.organizationId).eq("companyId", c._id)).collect(),
          ctx.db.query("companyCertifications").withIndex("by_organization_and_id", (q) => q.eq("organizationId", a.organizationId).eq("companyId", c._id)).collect(),
          ctx.db.query("companyProjects").withIndex("by_organization_and_id", (q) => q.eq("organizationId", a.organizationId).eq("companyId", c._id)).collect(),
          ctx.db.query("companyExemptions").withIndex("by_organization_and_id", (q) => q.eq("organizationId", a.organizationId).eq("companyId", c._id)).collect(),
        ]);
        return { ...c, completeness: { turnoverMissing: missing(t as never[]), certificationMissing: missing(ce as never[]), projectMissing: missing(p as never[]), exemptionMissing: missing(ex as never[]), totalMissing: missing([...t, ...ce, ...p, ...ex] as never[]), total: t.length + ce.length + p.length + ex.length } };
      }),
    );
  },
});
/** Gets one company with evidence and completeness. */
export const getCompany = query({
  args: { organizationId: v.string(), companyId: v.id("companies") },
  handler: async (ctx, a) => {
    await requireOrg(ctx, a.organizationId);
    const company = await ctx.db.get(a.companyId);
    if (!company || company.organizationId !== a.organizationId) throw new ConvexError({ code: "NOT_FOUND", message: "Company not found." });
    const [t, ce, p, ex] = await Promise.all([
      ctx.db.query("companyTurnover").withIndex("by_organization_and_id", (q) => q.eq("organizationId", a.organizationId).eq("companyId", a.companyId)).collect(),
      ctx.db.query("companyCertifications").withIndex("by_organization_and_id", (q) => q.eq("organizationId", a.organizationId).eq("companyId", a.companyId)).collect(),
      ctx.db.query("companyProjects").withIndex("by_organization_and_id", (q) => q.eq("organizationId", a.organizationId).eq("companyId", a.companyId)).collect(),
      ctx.db.query("companyExemptions").withIndex("by_organization_and_id", (q) => q.eq("organizationId", a.organizationId).eq("companyId", a.companyId)).collect(),
    ]);
    return { company, turnover: t, certifications: ce, projects: p, exemptions: ex, completeness: { turnoverMissing: missing(t as never[]), certificationMissing: missing(ce as never[]), projectMissing: missing(p as never[]), exemptionMissing: missing(ex as never[]), totalMissing: missing([...t, ...ce, ...p, ...ex] as never[]) } };
  },
});
/** Creates company; rejects blank name or duplicate registrationId. */
export const createCompany = mutation({
  args: { organizationId: v.string(), legalName: v.string(), registrationId: v.optional(v.string()) },
  handler: async (ctx, a) => {
    await requireOrg(ctx, a.organizationId);
    const name = a.legalName.trim();
    if (!name) throw new ConvexError({ code: "VALIDATION_FAILED", message: "Legal name required." });
    if (a.registrationId?.trim()) {
      const reg = a.registrationId.trim();
      const dup = await ctx.db.query("companies").withIndex("by_organization", (q) => q.eq("organizationId", a.organizationId)).collect();
      if (dup.some((c) => c.registrationId === reg)) throw new ConvexError({ code: "CONFLICT", message: "Duplicate registrationId." });
    }
    return ctx.db.insert("companies", { organizationId: a.organizationId, legalName: name, registrationId: a.registrationId?.trim() || undefined, status: "active", revision: 1, createdAt: Date.now(), updatedAt: Date.now() });
  },
});
/** Updates company with optimistic concurrency via revision. */
export const updateCompany = mutation({
  args: { organizationId: v.string(), companyId: v.id("companies"), revision: v.number(), legalName: v.optional(v.string()), registrationId: v.optional(v.string()) },
  handler: async (ctx, a) => {
    await requireOrg(ctx, a.organizationId);
    const cur = await ctx.db.get(a.companyId);
    if (!cur || cur.organizationId !== a.organizationId) throw new ConvexError({ code: "NOT_FOUND", message: "Company not found." });
    if (cur.revision !== a.revision) throw new ConvexError({ code: "CONFLICT", message: "Revision conflict." });
    const patch: Record<string, unknown> = { revision: cur.revision + 1, updatedAt: Date.now() };
    if (a.legalName !== undefined) {
      const n = a.legalName.trim();
      if (!n) throw new ConvexError({ code: "VALIDATION_FAILED", message: "Legal name required." });
      patch.legalName = n;
    }
    if (a.registrationId !== undefined) {
      const reg = a.registrationId.trim() || undefined;
      if (reg) {
        const dup = await ctx.db.query("companies").withIndex("by_organization", (q) => q.eq("organizationId", a.organizationId)).collect();
        if (dup.some((c) => c._id !== a.companyId && c.registrationId === reg)) throw new ConvexError({ code: "CONFLICT", message: "Duplicate registrationId." });
      }
      patch.registrationId = reg;
    }
    await ctx.db.patch(a.companyId, patch);
    return { revision: cur.revision + 1 };
  },
});
/** Archives company with revision check. */
export const archiveCompany = mutation({
  args: { organizationId: v.string(), companyId: v.id("companies"), revision: v.number() },
  handler: async (ctx, a) => {
    await requireOrg(ctx, a.organizationId);
    const cur = await ctx.db.get(a.companyId);
    if (!cur || cur.organizationId !== a.organizationId) throw new ConvexError({ code: "NOT_FOUND", message: "Company not found." });
    if (cur.revision !== a.revision) throw new ConvexError({ code: "CONFLICT", message: "Revision conflict." });
    await ctx.db.patch(a.companyId, { status: "archived", revision: cur.revision + 1, updatedAt: Date.now() });
    return { revision: cur.revision + 1 };
  },
});
/** Saves turnover after FY and INR validation. */
export const saveTurnover = mutation({
  args: { organizationId: v.string(), companyId: v.id("companies"), financialYear: v.string(), amountInr: v.string(), audited: v.boolean(), legalEntity: v.optional(v.string()) },
  handler: async (ctx, a) => {
    await requireOrg(ctx, a.organizationId);
    if (!isValidFinancialYear(a.financialYear)) throw new ConvexError({ code: "VALIDATION_FAILED", message: "Invalid financial year. Use YYYY-YY, e.g. 2023-24." });
    if (!isValidInrAmount(a.amountInr)) throw new ConvexError({ code: "VALIDATION_FAILED", message: "Invalid INR amount." });
    const co = await ctx.db.get(a.companyId);
    if (!co || co.organizationId !== a.organizationId) throw new ConvexError({ code: "NOT_FOUND", message: "Company not found." });
    return ctx.db.insert("companyTurnover", { organizationId: a.organizationId, companyId: a.companyId, financialYear: a.financialYear, amountInr: Number(a.amountInr), audited: a.audited, legalEntity: a.legalEntity?.trim() || undefined, createdAt: Date.now() });
  },
});
/** Saves certification after name/issuer and date-order validation. */
export const saveCertification = mutation({
  args: { organizationId: v.string(), companyId: v.id("companies"), name: v.string(), issuer: v.string(), validFrom: v.optional(v.number()), validUntil: v.optional(v.number()) },
  handler: async (ctx, a) => {
    await requireOrg(ctx, a.organizationId);
    if (!a.name.trim() || !a.issuer.trim()) throw new ConvexError({ code: "VALIDATION_FAILED", message: "Certification name and issuer required." });
    if (!isValidDateOrder(a.validFrom, a.validUntil)) throw new ConvexError({ code: "VALIDATION_FAILED", message: "validFrom must be before validUntil." });
    const co = await ctx.db.get(a.companyId);
    if (!co || co.organizationId !== a.organizationId) throw new ConvexError({ code: "NOT_FOUND", message: "Company not found." });
    return ctx.db.insert("companyCertifications", { organizationId: a.organizationId, companyId: a.companyId, name: a.name.trim(), issuer: a.issuer.trim(), validFrom: a.validFrom, validUntil: a.validUntil, createdAt: Date.now() });
  },
});
/** Saves project after client/value and date-order validation. */
export const saveProject = mutation({
  args: { organizationId: v.string(), companyId: v.id("companies"), clientName: v.string(), valueInr: v.optional(v.string()), startAt: v.optional(v.number()), endAt: v.optional(v.number()), completionState: v.union(v.literal("completed"), v.literal("ongoing")) },
  handler: async (ctx, a) => {
    await requireOrg(ctx, a.organizationId);
    if (!a.clientName.trim()) throw new ConvexError({ code: "VALIDATION_FAILED", message: "Client name required." });
    if (a.valueInr && !isValidInrAmount(a.valueInr)) throw new ConvexError({ code: "VALIDATION_FAILED", message: "Invalid project value." });
    if (!isValidDateOrder(a.startAt, a.endAt)) throw new ConvexError({ code: "VALIDATION_FAILED", message: "startAt must be before endAt." });
    const co = await ctx.db.get(a.companyId);
    if (!co || co.organizationId !== a.organizationId) throw new ConvexError({ code: "NOT_FOUND", message: "Company not found." });
    return ctx.db.insert("companyProjects", { organizationId: a.organizationId, companyId: a.companyId, clientName: a.clientName.trim(), valueInr: a.valueInr ? Number(a.valueInr) : undefined, startAt: a.startAt, endAt: a.endAt, completionState: a.completionState, createdAt: Date.now() });
  },
});
/** Saves exemption scheme entry. */
export const saveExemption = mutation({
  args: { organizationId: v.string(), companyId: v.id("companies"), scheme: v.string(), qualificationState: v.union(v.literal("qualified"), v.literal("pending"), v.literal("not_qualified")), validUntil: v.optional(v.number()) },
  handler: async (ctx, a) => {
    await requireOrg(ctx, a.organizationId);
    if (!a.scheme.trim()) throw new ConvexError({ code: "VALIDATION_FAILED", message: "Scheme required." });
    const co = await ctx.db.get(a.companyId);
    if (!co || co.organizationId !== a.organizationId) throw new ConvexError({ code: "NOT_FOUND", message: "Company not found." });
    return ctx.db.insert("companyExemptions", { organizationId: a.organizationId, companyId: a.companyId, scheme: a.scheme.trim(), qualificationState: a.qualificationState, validUntil: a.validUntil, createdAt: Date.now() });
  },
});
