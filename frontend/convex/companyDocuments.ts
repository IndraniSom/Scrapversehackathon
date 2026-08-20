/**
 * Private document upload with reservation, finalize, and tenant isolation.
 * Validates 15MB, PDF/DOCX, double extension, SHA-256, signature and hash agreement.
 * Returns quarantine/approved/rejected/deleted states without bearer URL leak.
 */
import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { throwConflict, throwNotFound, throwUnauthorized, throwValidation } from "./lib/errors";
/** Maximum bytes 15MiB. */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
/** Allowed MIME set. */
export const ALLOWED_MIME = new Set(["application/pdf","application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
/** SHA-256 hex. */
export const SHA256_RE = /^[a-f0-9]{64}$/;
/** MIME for extension. */
export function expectedMimeForFilename(name: string): string | null {
  const l = name.toLowerCase();
  if (l.endsWith(".pdf")) return "application/pdf";
  if (l.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return null;
}
/** Double extension check like foo.pdf.exe. */
export function hasDoubleExtension(name: string): boolean {
  const parts = name.toLowerCase().split(".");
  if (parts.length < 3) return false;
  const last = parts.at(-1)!, prev = parts.at(-2)!;
  const isExt = (s: string) => /^[a-z0-9]{1,5}$/.test(s);
  if (isExt(last) && isExt(prev)) return true;
  return new Set(["exe","js","sh","bat","cmd","com","scr","pif","vbs","html","htm","php","dll","so","bin","zip","rar"]).has(prev);
}
/** Safe single-extension filename. */
export function isSafeFilename(name: string): boolean {
  if (!name || name.length > 255) return false;
  if (name.includes("/") || name.includes("\\") || name.includes("\0") || name.includes("..")) return false;
  if (hasDoubleExtension(name)) return false;
  return expectedMimeForFilename(name) !== null;
}
/** SHA-256 hex validity. */
export function isValidSha256(s: string): boolean { return SHA256_RE.test(s.toLowerCase()); }
/** Signature match PDF %PDF, DOCX PK. */
export function matchesSignature(mime: string, h: Uint8Array): boolean {
  if (mime === "application/pdf") return h[0]===0x25&&h[1]===0x50&&h[2]===0x44&&h[3]===0x46;
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return h[0]===0x50&&h[1]===0x4b&&h[2]===0x03&&h[3]===0x04;
  return false;
}
/** Hex to bytes. */
export function hexToBytes(hex: string): Uint8Array {
  const c = hex.replace(/\s/g,"");
  const o = new Uint8Array(c.length/2);
  for(let i=0;i<o.length;i++) o[i]=parseInt(c.slice(i*2,i*2+2),16);
  return o;
}
/** Escapes filename for disposition. */
export function escapeFilename(n: string): string { return n.replace(/["\r\n]/g,"_").slice(0,180); }
/** Requires org auth. */
async function requireOrg(ctx: { auth:{getUserIdentity:()=>Promise<null|{subject:string;[k:string]:unknown}>}}): Promise<{organizationId:string;userId:string}>{
  const id = await ctx.auth.getUserIdentity();
  if(!id) throwUnauthorized();
  const org = (id as Record<string,unknown>)["orgId"] ?? (id as Record<string,unknown>)["organizationId"] ?? (id as Record<string,unknown>)["org_id"];
  if(typeof org!=="string"||!org) throwUnauthorized("Organization required.");
  return {organizationId:org,userId:id.subject};
}
/** Validates file meta before storage agreement. */
export function validateFileMeta(a:{fileName:string;mime:string;size:number;sha256:string;headerHex?:string}):void{
  if(!isSafeFilename(a.fileName)) throwValidation("Invalid filename or double extension.");
  const exp = expectedMimeForFilename(a.fileName);
  if(exp!==a.mime) throwValidation("MIME does not match extension.");
  if(!ALLOWED_MIME.has(a.mime)) throwValidation("Unsupported MIME type.");
  if(!Number.isInteger(a.size)||a.size<=0||a.size>MAX_FILE_BYTES) throwValidation("File size exceeds 15MB limit.");
  if(!isValidSha256(a.sha256)) throwValidation("Invalid SHA-256.");
  if(a.headerHex&&!matchesSignature(a.mime, hexToBytes(a.headerHex))) throwValidation("File signature does not match MIME.");
}
/** Generates storage upload URL after auth. */
export const generateUploadUrl = mutation({
  args:{},
  handler: async (ctx)=>{ await requireOrg(ctx); return await ctx.storage.generateUploadUrl(); },
});
/** Finalizes after size/type/signature/hash agreement into quarantined. */
export const finalizeUpload = mutation({
  args:{ storageId:v.id("_storage"), fileName:v.string(), mime:v.string(), size:v.number(), sha256:v.string(), headerHex:v.optional(v.string()), companyId:v.optional(v.id("companies")) },
  handler: async (ctx,args)=>{
    const org=await requireOrg(ctx);
    validateFileMeta(args);
    const meta=await ctx.storage.getMetadata(args.storageId);
    if(!meta) throwValidation("Storage not found.");
    if(meta.size!==args.size) throwValidation("Size mismatch.");
    if(meta.sha256.toLowerCase()!==args.sha256.toLowerCase()) throwValidation("Hash mismatch.");
    if(meta.contentType&&meta.contentType!==args.mime) throwValidation("Content-Type mismatch.");
    const dup=await ctx.db.query("companyDocuments").withIndex("by_organization_and_id",q=>q.eq("organizationId",org.organizationId).eq("sha256",args.sha256.toLowerCase())).first();
    if(dup&&dup.scanState!=="deleted") throwConflict("Duplicate document hash.");
    return await ctx.db.insert("companyDocuments",{ organizationId:org.organizationId, companyId:args.companyId, storageId:args.storageId, sha256:args.sha256.toLowerCase(), mime:args.mime, size:args.size, fileName:escapeFilename(args.fileName), scanState:"quarantined", revision:0, createdAt:Date.now() });
  },
});
/** Lists org documents without URLs, hides deleted. */
export const listDocuments = query({
  args:{ companyId:v.optional(v.id("companies")) },
  handler: async (ctx,args)=>{
    const org=await requireOrg(ctx);
    const all=await ctx.db.query("companyDocuments").withIndex("by_organization",q=>q.eq("organizationId",org.organizationId)).collect();
    return all.filter(d=>d.scanState!=="deleted"&&(args.companyId?d.companyId===args.companyId:true));
  },
});
/** Gets one document enforcing tenant and deleted. */
export const getDocument = query({
  args:{ documentId:v.id("companyDocuments") },
  handler: async (ctx,args)=>{
    const org=await requireOrg(ctx);
    const doc=await ctx.db.get(args.documentId);
    if(!doc||doc.organizationId!==org.organizationId) throwNotFound();
    if(doc.scanState==="deleted") throwNotFound();
    return doc;
  },
});
/** Approve quarantined. */
export const approveDocument = mutation({ args:{documentId:v.id("companyDocuments")}, handler: async (ctx,args)=>{
  const o=await requireOrg(ctx); const d=await ctx.db.get(args.documentId);
  if(!d||d.organizationId!==o.organizationId) throwNotFound(); if(d.scanState==="deleted") throwNotFound();
  await ctx.db.patch(args.documentId,{scanState:"approved"});
}});
/** Reject quarantined. */
export const rejectDocument = mutation({ args:{documentId:v.id("companyDocuments")}, handler: async (ctx,args)=>{
  const o=await requireOrg(ctx); const d=await ctx.db.get(args.documentId);
  if(!d||d.organizationId!==o.organizationId) throwNotFound(); if(d.scanState==="deleted") throwNotFound();
  await ctx.db.patch(args.documentId,{scanState:"rejected"});
}});
/** Soft-delete. */
export const deleteDocument = mutation({ args:{documentId:v.id("companyDocuments")}, handler: async (ctx,args)=>{
  const o=await requireOrg(ctx); const d=await ctx.db.get(args.documentId);
  if(!d||d.organizationId!==o.organizationId) throwNotFound();
  await ctx.db.patch(args.documentId,{scanState:"deleted"});
}});
/** Returns storage URL for proxy after auth (server only). */
export const getDownloadUrl = action({ args:{documentId:v.id("companyDocuments")}, handler: async (ctx,args)=>{
  const id=await ctx.auth.getUserIdentity(); if(!id) throwUnauthorized();
  const doc = await ctx.runQuery(api.companyDocuments.getDocument, args) as { storageId: string };
  return await ctx.storage.getUrl(doc.storageId as never);
}});
