/** Persistent cited Q&A, brief, and working-translation requests. */
import { v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireOrganization } from "./lib/authorization";
import { throwValidation } from "./lib/errors";

const kindValidator = v.union(v.literal("qa"), v.literal("brief"), v.literal("translation"));
type Kind = "qa" | "brief" | "translation";
type RequestResult = { id: string; status: "succeeded" | "needs_review" | "failed" };

/** Signs an exact worker request body. */
async function sign(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return `sha256=${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** Loads authorized tender chunks for one request. */
export const prepare = internalQuery({
  args: { opportunityId: v.id("opportunities") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const opportunity = await ctx.db.get(args.opportunityId);
    if (opportunity === null || opportunity.organizationId !== auth.organizationId) throwValidation("Opportunity not found.");
    const documents = await ctx.db.query("opportunityDocuments").withIndex("by_organization_and_id", (index) => index.eq("organizationId", auth.organizationId).eq("opportunityId", args.opportunityId)).collect();
    const chunks = [];
    for (const document of documents) {
      const rows = await ctx.db.query("documentChunks").withIndex("by_organization_and_id", (index) => index.eq("organizationId", auth.organizationId).eq("documentId", document._id)).collect();
      for (const chunk of rows) chunks.push({
        chunk_id: String(chunk._id), organization_id: auth.organizationId, opportunity_id: String(args.opportunityId), document_id: String(document._id), document_hash: document.digest ?? chunk.textHash, page_number: chunk.pageStart, text: chunk.boundedText,
      });
    }
    return { organizationId: auth.organizationId, chunks };
  },
});

/** Persists one completed or failed intelligence response. */
export const store = internalMutation({
  args: { opportunityId: v.id("opportunities"), organizationId: v.string(), kind: kindValidator, question: v.optional(v.string()), language: v.optional(v.string()), status: v.union(v.literal("succeeded"), v.literal("needs_review"), v.literal("failed")), resultJson: v.optional(v.string()), failureCode: v.optional(v.string()) },
  handler: async (ctx, args) => ctx.db.insert("tenderIntelligence", { ...args, createdAt: Date.now(), updatedAt: Date.now() }),
});

/** Calls signed FastAPI intelligence worker and stores its result. */
export const request = action({
  args: { opportunityId: v.id("opportunities"), kind: kindValidator, question: v.optional(v.string()), language: v.optional(v.string()) },
  handler: async (ctx, args): Promise<RequestResult> => {
    const prepared: { organizationId: string; chunks: unknown[] } = await ctx.runQuery(internal.tenderIntelligence.prepare, { opportunityId: args.opportunityId });
    const baseUrl = process.env.BIDRADAR_WORKER_BASE_URL;
    const secret = process.env.BIDRADAR_WORKER_HMAC_SECRET;
    if (!baseUrl || !secret) throwValidation("Tender intelligence worker is unavailable.");
    const body = JSON.stringify({ kind: args.kind, organizationId: prepared.organizationId, opportunityId: String(args.opportunityId), question: args.question, language: args.language, chunks: prepared.chunks });
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/internal/v1/tender-intelligence`, { method: "POST", headers: { "Content-Type": "application/json", "X-Worker-Signature": await sign(body, secret) }, body });
    let payload: unknown;
    try { payload = await response.json(); } catch { payload = null; }
    const failureCode = payload !== null && typeof payload === "object" && "detail" in payload && payload.detail !== null && typeof payload.detail === "object" && "code" in payload.detail ? String(payload.detail.code) : `WORKER_HTTP_${response.status}`;
    const status = response.ok ? "succeeded" : failureCode === "TRANSLATION_PROVIDER_REQUIRED" ? "needs_review" : "failed";
    const result = response.ok && payload !== null && typeof payload === "object" && "result" in payload ? JSON.stringify(payload.result) : undefined;
    const id = await ctx.runMutation(internal.tenderIntelligence.store, { opportunityId: args.opportunityId, organizationId: prepared.organizationId, kind: args.kind as Kind, question: args.question, language: args.language, status, resultJson: result, failureCode: response.ok ? undefined : failureCode });
    return { id: String(id), status };
  },
});

/** Lists newest intelligence results for caller-owned opportunity. */
export const list = query({
  args: { opportunityId: v.id("opportunities") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    return ctx.db.query("tenderIntelligence").withIndex("by_organization_and_id", (index) => index.eq("organizationId", auth.organizationId).eq("opportunityId", args.opportunityId)).order("desc").collect();
  },
});
