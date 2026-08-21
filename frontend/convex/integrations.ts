/** Submission handoff and outbound webhooks with signed events, SSRF, API keys, exports. Cross-tenant isolation enforced via organizationId checks. */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrganization } from "./lib/authorization";
import { throwForbidden, throwNotFound, throwValidation } from "./lib/errors";
export { toCsv, toIcs, toJson } from "./integrationFormats";

const ALLOWED_PORTALS = ["CPPP", "GeM", "NTPC", "WEST_BENGAL", "ODISHA"] as const;
const WEBHOOK_EVENTS = ["opportunity.created","opportunity.updated","assessment.completed","amendment.detected","review.decided","proposal.locked","submission.prepared"] as const;
const MAX_ATTEMPTS = 5;
const REPLAY_TOLERANCE_MS = 5 * 60 * 1000;

/** Returns true when portal is allowlisted. */
export function isAllowedPortal(p: string): boolean { return (ALLOWED_PORTALS as readonly string[]).includes(p); }
/** Returns true when https official link. */
export function isOfficialUrl(u: string): boolean { try { const x=new URL(u); return x.protocol==="https:" && x.hostname.includes("."); } catch { return false; } }
/** Validates sha256 hex. */
export function isSha256(d: string): boolean { return /^[a-f0-9]{64}$/i.test(d); }
/** Checks private/metadata host or IP. */
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (["localhost","metadata.google.internal"].includes(h) || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (h==="127.0.0.1" || h==="0.0.0.0" || h==="::1" || h==="169.254.169.254") return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(h)) return true;
  if (/^169\.254\.\d+\.\d+$/.test(h)) return true;
  if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  return false;
}
/** Validates webhook URL for SSRF: https only, no private host, no creds. */
export function validateWebhookUrl(url: string): { valid: boolean; reason?: string } {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return { valid: false, reason: "HTTPS required" };
    if (u.username || u.password) return { valid: false, reason: "Credentials not allowed" };
    if (isPrivateHost(u.hostname)) return { valid: false, reason: "Private host blocked" };
    if (!u.hostname.includes(".")) return { valid: false, reason: "Invalid host" };
    return { valid: true };
  } catch { return { valid: false, reason: "Invalid URL" }; }
}
/** Builds versioned envelope. */
export function buildEnvelope(a: { organizationId: string; type: string; dataId: string; revision: number; traceId?: string }) {
  return { id: `evt_${crypto.randomUUID()}`, organizationId: a.organizationId, type: a.type, occurredAt: new Date().toISOString(), data: { id: a.dataId, revision: a.revision }, traceId: a.traceId ?? crypto.randomUUID(), version: "v1" as const };
}
/** Signs body with timestamped HMAC-SHA256 hex (Node/web compatible). */
export async function signPayload(body: string, timestamp: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2,"0")).join("");
}
/** Verifies HMAC signature with replay tolerance (5m). */
export async function verifySignature(body: string, timestamp: string, signature: string, secret: string, now = Date.now()): Promise<boolean> {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > REPLAY_TOLERANCE_MS) return false;
  const expected = await signPayload(body, timestamp, secret);
  if (expected.length !== signature.length) return false;
  let diff = 0; for (let i=0;i<expected.length;i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff===0;
}
/** Hashes API key with SHA-256 hex. */
export async function hashApiKey(key: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(d)).map((b)=>b.toString(16).padStart(2,"0")).join("");
}
/** Generates random api key with prefix. */
export function generateApiKey(): string { return `bdr_${crypto.randomUUID().replace(/-/g,"")}${crypto.randomUUID().replace(/-/g,"").slice(0,8)}`; }
/** Next backoff ms exponential capped at 60s. */
export function nextBackoffMs(attempt: number): number { return Math.min(60000, 1000 * 2 ** attempt); }
/** Whether HTTP status should retry. */
export function shouldRetry(status: number): boolean { return status >= 500 || status === 429 || status === 408; }
/** Whether attempts exceeded dead-letter threshold. */
export function isDeadLetter(attempt: number): boolean { return attempt >= MAX_ATTEMPTS; }
/** Returns connector status for a package. */
export const status = query({
  args: { packageId: v.id("submissionPackages") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const pkg = await ctx.db.get(args.packageId);
    if (!pkg || pkg.organizationId!==auth.organizationId) throwNotFound("Package not found.");
    const receipts = await ctx.db.query("submissionReceipts").withIndex("by_organization_and_id",(q)=>q.eq("organizationId",auth.organizationId).eq("packageId",args.packageId)).collect();
    return { packageId:args.packageId, validationState:pkg.validationState, approvalState:pkg.approvalState, receipts:receipts.length, portalAllowed:true };
  },
});
/** Registers webhook endpoint with SSRF verification. */
export const registerWebhook = mutation({
  args: { url: v.string(), events: v.array(v.string()), secret: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (auth.role!=="org:admin") throwForbidden("Only admin may manage webhooks.");
    const chk = validateWebhookUrl(args.url);
    if (!chk.valid) throwValidation(chk.reason ?? "Invalid URL");
    for (const e of args.events) if (!(WEBHOOK_EVENTS as readonly string[]).includes(e)) throwValidation(`Unsupported event ${e}`);
    const secret = args.secret ?? crypto.randomUUID();
    const secretHash = await hashApiKey(secret);
    const id = await ctx.db.insert("integrationConnections",{organizationId:auth.organizationId,provider:"webhook",referenceName:args.url,scopes:args.events,secretHash,state:"active",createdAt:Date.now()});
    await ctx.db.insert("auditEvents",{organizationId:auth.organizationId,actorId:auth.clerkUserId,action:"webhook.register",targetType:"integrationConnection",targetId:id,afterDigest:secretHash,traceId:crypto.randomUUID(),createdAt:Date.now()});
    return { id, url:args.url, secret, secretHash };
  },
});
/** Lists webhook endpoints for org. */
export const listWebhooks = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireOrganization(ctx);
    const rows = await ctx.db.query("integrationConnections").withIndex("by_organization",(q)=>q.eq("organizationId",auth.organizationId)).collect();
    return rows.filter((row)=>row.provider==="webhook").map((row) => ({ _id: row._id, url: row.referenceName, events: row.scopes ?? [], state: row.state, createdAt: row.createdAt }));
  },
});
/** Rotates webhook secret with hashed storage. */
export const rotateSecret = mutation({
  args: { id: v.id("integrationConnections") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (auth.role!=="org:admin") throwForbidden("Only admin may rotate.");
    const rec = await ctx.db.get(args.id);
    if (!rec || rec.organizationId!==auth.organizationId) throwNotFound("Endpoint not found.");
    const secret = crypto.randomUUID();
    const secretHash = await hashApiKey(secret);
    await ctx.db.patch(args.id,{secretHash});
    await ctx.db.insert("auditEvents",{organizationId:auth.organizationId,actorId:auth.clerkUserId,action:"webhook.rotate",targetType:"integrationConnection",targetId:args.id,afterDigest:secretHash,traceId:crypto.randomUUID(),createdAt:Date.now()});
    return { id:args.id, secret, secretHash };
  },
});
/** Disables webhook endpoint. */
export const disableWebhook = mutation({
  args: { id: v.id("integrationConnections") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (auth.role!=="org:admin") throwForbidden("Only admin may disable.");
    const rec = await ctx.db.get(args.id);
    if (!rec || rec.organizationId!==auth.organizationId) throwNotFound("Endpoint not found.");
    await ctx.db.patch(args.id,{state:"disabled"});
    return { disabled:true };
  },
});
/** Creates API key with hashed storage (admin only). */
export const createApiKey = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (auth.role!=="org:admin") throwForbidden("Only admin may create keys.");
    if (!args.name.trim()) throwValidation("Name required.");
    const raw = generateApiKey();
    const hash = await hashApiKey(raw);
    const id = await ctx.db.insert("integrationConnections",{organizationId:auth.organizationId,provider:"api_key",referenceName:args.name.trim(),scopes:[hash],state:"active",createdAt:Date.now()});
    await ctx.db.insert("auditEvents",{organizationId:auth.organizationId,actorId:auth.clerkUserId,action:"apikey.create",targetType:"integrationConnection",targetId:id,traceId:crypto.randomUUID(),createdAt:Date.now()});
    return { id, key:raw, hash };
  },
});
/** Lists API key metadata without returning stored hashes. */
export const listApiKeys = query({ args: {}, handler: async (ctx) => { const auth = await requireOrganization(ctx); const rows = await ctx.db.query("integrationConnections").withIndex("by_organization", (q) => q.eq("organizationId", auth.organizationId)).collect(); return rows.filter((row) => row.provider === "api_key").map((row) => ({ _id: row._id, name: row.referenceName, state: row.state, createdAt: row.createdAt })); } });
/** Revokes API key. */
export const revokeApiKey = mutation({
  args: { id: v.id("integrationConnections") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (auth.role!=="org:admin") throwForbidden("Only admin may revoke.");
    const rec = await ctx.db.get(args.id);
    if (!rec || rec.organizationId!==auth.organizationId) throwNotFound("Key not found.");
    await ctx.db.patch(args.id,{state:"disabled"});
    return { revoked:true };
  },
});
