/** Convex HTTP routes with verified webhook and tenant-key boundaries. */
import { httpRouter } from "convex/server";
import { Webhook } from "svix";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { brightDataWebhook } from "./brightDataWebhook";

const http = httpRouter();

/** Serializes a standard JSON HTTP response. */
function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Returns whether a parsed JSON value is a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Reads a non-empty string field from a webhook payload. */
function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Computes a SHA-256 hexadecimal digest for an API key. */
async function sha256(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Verifies a Clerk Svix payload and rejects a missing signing secret. */
function verifyClerkWebhook(payload: string, headers: Record<string, string>, secret: string): boolean {
  if (secret.length === 0) return false;
  try {
    new Webhook(secret).verify(payload, headers);
    return true;
  } catch {
    return false;
  }
}

/** Dispatches validated Clerk events to typed internal synchronization functions. */
async function handleClerkEvent(ctx: Parameters<typeof httpAction>[0] extends (context: infer Context, request: Request) => unknown ? Context : never, event: Record<string, unknown>, eventId: string): Promise<Response | null> {
  const type = stringValue(event.type);
  const data = isRecord(event.data) ? event.data : null;
  if (type === null || data === null) return jsonResponse({ code: "VALIDATION_FAILED" }, 400);
  if (type === "user.created" || type === "user.updated") {
    const clerkUserId = stringValue(data.id);
    const organizationId = stringValue(data.organization_id);
    if (clerkUserId === null || organizationId === null) return jsonResponse({ code: "VALIDATION_FAILED" }, 400);
    const emails = Array.isArray(data.email_addresses) ? data.email_addresses : [];
    const firstEmail = emails.find(isRecord);
    const first = stringValue(data.first_name);
    const last = stringValue(data.last_name);
    await ctx.runMutation(internal.users.internalSyncUser, { clerkUserId, organizationId, eventId, email: firstEmail === undefined ? undefined : stringValue(firstEmail.email_address) ?? undefined, displayName: [first, last].filter((part): part is string => part !== null).join(" ") || undefined });
  } else if (type === "user.deleted") {
    const clerkUserId = stringValue(data.id);
    if (clerkUserId === null) return jsonResponse({ code: "VALIDATION_FAILED" }, 400);
    await ctx.runMutation(internal.users.internalDeleteUser, { clerkUserId, eventId });
  } else if (type === "organization.created" || type === "organization.updated") {
    const clerkOrganizationId = stringValue(data.id);
    if (clerkOrganizationId === null) return jsonResponse({ code: "VALIDATION_FAILED" }, 400);
    await ctx.runMutation(internal.organizations.internalSyncOrganization, { clerkOrganizationId, slug: stringValue(data.slug) ?? clerkOrganizationId, displayName: stringValue(data.name) ?? clerkOrganizationId, eventId });
  } else if (type === "organization.deleted") {
    const clerkOrganizationId = stringValue(data.id);
    if (clerkOrganizationId === null) return jsonResponse({ code: "VALIDATION_FAILED" }, 400);
    await ctx.runMutation(internal.organizations.internalDeleteOrganization, { clerkOrganizationId, eventId });
  } else if (type === "organizationMembership.created" || type === "organizationMembership.updated") {
    const publicUser = isRecord(data.public_user_data) ? data.public_user_data : null;
    const organization = isRecord(data.organization) ? data.organization : null;
    const clerkUserId = stringValue(publicUser?.user_id) ?? stringValue(data.user_id);
    const clerkOrganizationId = stringValue(organization?.id) ?? stringValue(data.organization_id);
    if (clerkUserId === null || clerkOrganizationId === null) return jsonResponse({ code: "VALIDATION_FAILED" }, 400);
    await ctx.runMutation(internal.organizations.internalSyncMembership, {
      clerkUserId,
      clerkOrganizationId,
      role: stringValue(data.role) ?? "org:viewer",
      eventId,
    });
  } else if (type === "organizationMembership.deleted") {
    const publicUser = isRecord(data.public_user_data) ? data.public_user_data : null;
    const organization = isRecord(data.organization) ? data.organization : null;
    const clerkUserId = stringValue(publicUser?.user_id) ?? stringValue(data.user_id);
    const clerkOrganizationId = stringValue(organization?.id) ?? stringValue(data.organization_id);
    if (clerkUserId === null || clerkOrganizationId === null) return jsonResponse({ code: "VALIDATION_FAILED" }, 400);
    await ctx.runMutation(internal.organizations.internalDeleteMembership, { clerkUserId, clerkOrganizationId, eventId });
  }
  return null;
}

/** Receives only signed Clerk webhooks. */
http.route({ path: "/clerk-webhook", method: "POST", handler: httpAction(async (ctx, request) => {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET ?? process.env.CLERK_WEBHOOK_SECRET ?? "";
  const payload = await request.text();
  const headers = { "svix-id": request.headers.get("svix-id") ?? "", "svix-timestamp": request.headers.get("svix-timestamp") ?? "", "svix-signature": request.headers.get("svix-signature") ?? "" };
  if (!verifyClerkWebhook(payload, headers, secret)) return jsonResponse({ code: "UNAUTHORIZED" }, 401);
  let event: unknown;
  try { event = JSON.parse(payload); } catch { return jsonResponse({ code: "VALIDATION_FAILED" }, 400); }
  if (!isRecord(event)) return jsonResponse({ code: "VALIDATION_FAILED" }, 400);
  const eventId = headers["svix-id"] || stringValue(event.id);
  if (eventId === null || eventId.length === 0) return jsonResponse({ code: "VALIDATION_FAILED" }, 400);
  return (await handleClerkEvent(ctx, event, eventId)) ?? jsonResponse({ ok: true });
}) });

/** Exports tenant metadata only to a matched active API key. */
http.route({ path: "/exports", method: "GET", handler: httpAction(async (ctx, request) => {
  const apiKey = request.headers.get("x-api-key") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (apiKey.length === 0) return jsonResponse({ code: "UNAUTHORIZED" }, 401);
  const hash = await sha256(apiKey);
  const connection = await ctx.runQuery(internal.exportKeys.findActiveApiKey, { hash });
  if (connection === null) return jsonResponse({ code: "UNAUTHORIZED" }, 401);
  const exportedAt = new Date().toISOString();
  const format = new URL(request.url).searchParams.get("format") ?? "json";
  if (format === "csv") return new Response(`organization_id,exported_at\n${connection.organizationId},${exportedAt}\n`, { headers: { "Content-Type": "text/csv" } });
  if (format === "ics") return new Response(`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//BidRadar//${connection.organizationId}\r\nEND:VCALENDAR\r\n`, { headers: { "Content-Type": "text/calendar" } });
  if (format !== "json") return jsonResponse({ code: "VALIDATION_FAILED" }, 400);
  return jsonResponse({ organizationId: connection.organizationId, exportedAt });
}) });

http.route({ path: "/brightdata/webhook", method: "POST", handler: brightDataWebhook });

export default http;
