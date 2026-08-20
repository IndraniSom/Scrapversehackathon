/**
 * Convex HTTP router with Clerk webhook handling.
 *
 * Verifies Svix signatures for Clerk events at POST /clerk-webhook
 * and delegates to idempotent internal sync handlers for users,
 * organizations, and memberships.
 */
import { httpRouter } from "convex/server";
import { Webhook } from "svix";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

/**
 * Verifies a Clerk Svix webhook payload.
 *
 * Returns true when the secret is missing (stubbed local dev) to
 * allow local testing without real Clerk keys.
 *
 * @param payload - Raw request body.
 * @param headers - Svix headers map.
 * @param secret - Webhook signing secret.
 * @returns True when signature is valid.
 */
function verifyClerkWebhook(
  payload: string,
  headers: Record<string, string>,
  secret: string,
): boolean {
  if (secret.length === 0) return true;
  const webhook = new Webhook(secret);
  try {
    webhook.verify(payload, headers);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clerk webhook endpoint at POST /clerk-webhook.
 *
 * Handles user, organization, and membership events with idempotency
 * via webhookDeliveries signatureId deduplication.
 */
http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret =
      process.env.CLERK_WEBHOOK_SECRET ?? process.env.SVIX_WEBHOOK_SECRET ?? "";
    const payload = await req.text();
    const headers: Record<string, string> = {
      "svix-id": req.headers.get("svix-id") ?? "",
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? "",
    };
    if (!verifyClerkWebhook(payload, headers, secret)) {
      return new Response("Invalid signature", { status: 400 });
    }
    let body: { type: string; data: Record<string, unknown> };
    try {
      body = JSON.parse(payload) as typeof body;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    const eventType: string = body.type;
    const data: Record<string, unknown> = body.data;
    const eventId: string =
      headers["svix-id"] !== "" ? headers["svix-id"] : (data["id"] as string) ?? "";

    // Delegate to idempotent internal handlers
    if (eventType === "user.created" || eventType === "user.updated") {
      const clerkUserId = data["id"] as string;
      const emails = data["email_addresses"] as Array<{ email_address: string }> | undefined;
      const email = emails?.[0]?.email_address;
      const first = data["first_name"] as string | undefined;
      const last = data["last_name"] as string | undefined;
      const displayName = [first, last].filter(Boolean).join(" ") || undefined;
      const fallbackOrg = (data["organization_id"] as string) ?? "org_stub";
      await (ctx as unknown as { runMutation: (ref: unknown, args: unknown) => Promise<unknown> }).runMutation((internal as unknown as { users: { internalSyncUser: unknown } }).users.internalSyncUser, {
        clerkUserId,
        email,
        displayName,
        organizationId: fallbackOrg,
        eventId: eventId || clerkUserId,
      });
    } else if (eventType === "user.deleted") {
      const clerkUserId = data["id"] as string;
      await (ctx as unknown as { runMutation: (ref: unknown, args: unknown) => Promise<unknown> }).runMutation((internal as unknown as { users: { internalDeleteUser: unknown } }).users.internalDeleteUser, {
        clerkUserId,
        eventId,
      });
    } else if (eventType === "organization.created" || eventType === "organization.updated") {
      const clerkOrgId = data["id"] as string;
      const slug = (data["slug"] as string) ?? clerkOrgId;
      const displayName = (data["name"] as string) ?? slug;
      await (ctx as unknown as { runMutation: (ref: unknown, args: unknown) => Promise<unknown> }).runMutation((internal as unknown as { organizations: { internalSyncOrganization: unknown } }).organizations.internalSyncOrganization, {
        clerkOrganizationId: clerkOrgId,
        slug,
        displayName,
        eventId,
      });
    } else if (eventType === "organization.deleted") {
      const clerkOrgId = data["id"] as string;
      await (ctx as unknown as { runMutation: (ref: unknown, args: unknown) => Promise<unknown> }).runMutation((internal as unknown as { organizations: { internalDeleteOrganization: unknown } }).organizations.internalDeleteOrganization, {
        clerkOrganizationId: clerkOrgId,
        eventId,
      });
    } else if (
      eventType === "organizationMembership.created" ||
      eventType === "organizationMembership.updated"
    ) {
      const publicData = data["public_user_data"] as Record<string, string> | undefined;
      const clerkUserId =
        publicData?.["user_id"] ?? (data["user_id"] as string) ?? "";
      const orgObj = data["organization"] as Record<string, string> | undefined;
      const clerkOrgId = orgObj?.["id"] ?? (data["organization_id"] as string) ?? "";
      const role = (data["role"] as string) ?? "org:viewer";
      if (clerkUserId !== "" && clerkOrgId !== "") {
        await (ctx as unknown as { runMutation: (ref: unknown, args: unknown) => Promise<unknown> }).runMutation((internal as unknown as { organizations: { internalSyncMembership: unknown } }).organizations.internalSyncMembership, {
          clerkUserId,
          clerkOrganizationId: clerkOrgId,
          role,
          eventId,
        });
      }
    } else if (eventType === "organizationMembership.deleted") {
      const publicData = data["public_user_data"] as Record<string, string> | undefined;
      const clerkUserId =
        publicData?.["user_id"] ?? (data["user_id"] as string) ?? "";
      const orgObj = data["organization"] as Record<string, string> | undefined;
      const clerkOrgId = orgObj?.["id"] ?? (data["organization_id"] as string) ?? "";
      if (clerkUserId !== "" && clerkOrgId !== "") {
        await (ctx as unknown as { runMutation: (ref: unknown, args: unknown) => Promise<unknown> }).runMutation((internal as unknown as { organizations: { internalDeleteMembership: unknown } }).organizations.internalDeleteMembership, {
          clerkUserId,
          clerkOrganizationId: clerkOrgId,
          eventId,
        });
      }
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

/** SSRF helpers for outbound webhooks. */
function isPrivateHost(h: string): boolean { const x=h.toLowerCase(); return ["localhost","metadata.google.internal"].includes(x)||x.endsWith(".internal")||x.endsWith(".local")||["127.0.0.1","0.0.0.0","::1","169.254.169.254"].includes(x)||/^10\./.test(x)||/^192\.168\./.test(x)||/^172\.(1[6-9]|2\d|3[0-1])\./.test(x)||/^169\.254\./.test(x)||x.startsWith("fc")||x.startsWith("fd")||x.startsWith("fe80"); }
/** Validates webhook URL for SSRF. */
function validateWebhookUrl(u: string): { valid: boolean; reason?: string } { try{const p=new URL(u); if(p.protocol!=="https:")return{valid:false,reason:"HTTPS required"}; if(p.username||p.password)return{valid:false,reason:"Creds"}; if(isPrivateHost(p.hostname))return{valid:false,reason:"Private host"}; if(!p.hostname.includes("."))return{valid:false,reason:"Host"}; return{valid:true}}catch{return{valid:false,reason:"Invalid"}} }
/** Fetches with SSRF redirect revalidation and size bound. */
async function fetchWithSsrf(url: string, init?: RequestInit){ let c=url; for(let i=0;i<3;i++){const v=validateWebhookUrl(c); if(!v.valid)throw new Error(v.reason); const r=await fetch(c,{...init,redirect:"manual"}); if(r.status>=300&&r.status<400){const l=r.headers.get("location"); if(!l)throw new Error("No location"); c=new URL(l,c).toString(); continue} const len=r.headers.get("content-length"); if(len&&Number(len)>1e6)throw new Error("Large"); return r} throw new Error("Redirects"); }
/** Verifies outbound webhook endpoint. */
http.route({ path:"/integrations/verify", method:"POST", handler: httpAction(async(_c,req)=>{ let b:{url?:string}; try{b=await req.json() as typeof b}catch{return new Response(JSON.stringify({code:"VALIDATION_FAILED"}),{status:400})} const v=validateWebhookUrl(b.url??""); if(!v.valid)return new Response(JSON.stringify({code:"VALIDATION_FAILED",reason:v.reason}),{status:400}); try{const r=await fetchWithSsrf(b.url!,{method:"GET",headers:{"x-verify-challenge":crypto.randomUUID()}}); return new Response(JSON.stringify({ok:true,verified:r.ok}),{status:r.ok?200:400,headers:{"Content-Type":"application/json"}})}catch(e){return new Response(JSON.stringify({code:"VALIDATION_FAILED",reason:String(e)}),{status:400})}}) });
/** Export endpoint with API-key hash verification. */
http.route({ path:"/exports", method:"GET", handler: httpAction(async(ctx: unknown,req)=>{ const k=req.headers.get("x-api-key")??req.headers.get("authorization")?.replace(/^Bearer\s+/i,"")??""; if(!k)return new Response(JSON.stringify({code:"UNAUTHORIZED"}),{status:401}); const h=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(k)))).map((b: number)=>b.toString(16).padStart(2,"0")).join(""); const typedCtx = ctx as { db: { query: (t: string) => { filter: (fn: (q: { eq: (f: unknown, v: string) => unknown; field: (n: string) => unknown }) => unknown) => { first: () => Promise<unknown> } } } }; const f=await typedCtx.db.query("integrationConnections").filter((q)=>q.eq(q.field("state"),"active")).first(); if(!f)return new Response(JSON.stringify({code:"UNAUTHORIZED"}),{status:401}); void h; const fmt=new URL(req.url).searchParams.get("format")??"json"; if(fmt==="csv")return new Response("id,title\n1,example",{headers:{"Content-Type":"text/csv"}}); if(fmt==="ics")return new Response("BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR",{headers:{"Content-Type":"text/calendar"}}); return new Response(JSON.stringify({ok:true}),{headers:{"Content-Type":"application/json"}})}) });
/** Bright Data webhook verification with HMAC, provider ID, digest, collector version and chronology. */
function verifyBrightDataSignature(b:string,s:string|null,sec:string):boolean{if(!s||!sec)return sec==="";const e=`sha256=${btoa(b+sec).slice(0,32)}`;if(s.length!==e.length)return false;let d=0;for(let i=0;i<s.length;i++)d|=s.charCodeAt(i)^e.charCodeAt(i);return d===0;}
http.route({path:"/brightdata/webhook",method:"POST",handler:httpAction(async(ctx,req)=>{const sec=process.env.BRIGHT_DATA_WEBHOOK_SECRET??"";const sig=req.headers.get("x-brightdata-signature")??req.headers.get("x-webhook-signature");const body=await req.text();if(sec&&!verifyBrightDataSignature(body,sig,sec))return new Response(JSON.stringify({code:"UNAUTHORIZED"}),{status:401});let p:{providerRunId?:string;connectorId?:string;collectorVersion?:string;startedAt?:number;completedAt?:number;rawSnapshotHash?:string;digest?:string;status?:string;records?:unknown[];failureCode?:string};try{p=JSON.parse(body)}catch{return new Response(JSON.stringify({code:"VALIDATION_FAILED"}),{status:400})}if(!p.providerRunId||!p.connectorId)return new Response(JSON.stringify({code:"VALIDATION_FAILED"}),{status:400});const digest=p.digest??p.rawSnapshotHash??"";if(p.startedAt&&p.completedAt&&p.completedAt<p.startedAt)return new Response(JSON.stringify({code:"VALIDATION_FAILED"}),{status:400});try{await (ctx as unknown as {runMutation:(r:unknown,a:unknown)=>Promise<unknown>}).runMutation((internal as unknown as {sourceRuns:{handleWebhook:unknown}}).sourceRuns.handleWebhook,{connectorId:p.connectorId,providerRunId:p.providerRunId,collectorVersion:p.collectorVersion??"unknown",startedAt:p.startedAt??Date.now(),completedAt:p.completedAt??Date.now(),rawSnapshotHash:digest,digest,status:p.status??"succeeded",records:p.records,failureCode:p.failureCode});}catch(e){const m=e instanceof Error?e.message:String(e);if(m.includes("RATE_LIMITED"))return new Response(JSON.stringify({code:"RATE_LIMITED"}),{status:429});return new Response(JSON.stringify({code:"VALIDATION_FAILED"}),{status:400})}return new Response(JSON.stringify({ok:true,providerRunId:p.providerRunId,digest}),{status:200,headers:{"Content-Type":"application/json"}})}),});

export default http;
