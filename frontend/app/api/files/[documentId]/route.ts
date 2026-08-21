/**
 * Permission-checked file proxy.
 * Verifies Clerk org, Convex tenant, deleted state, then streams
 * with attachment disposition and nosniff.
 */
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/** Convex client factory. */
function convexClient(token?: string | null): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_CONVEX_URL");
  const c = new ConvexHttpClient(url);
  if (token) c.setAuth(token);
  return c;
}

/** Escapes filename for disposition. */
function disposition(filename: string): string {
  const safe = filename.replace(/["\r\n]/g, "_").slice(0, 180) || "document";
  const encoded = encodeURIComponent(safe);
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

/** GET streams a private document after permission check. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ documentId: string }> },
): Promise<Response> {
  const { documentId } = await params;
  if (!documentId || documentId.includes("..") || documentId.includes("/")) {
    return new Response("Invalid document id", { status: 400, headers: { "X-Content-Type-Options": "nosniff" } });
  }
  const authRes = await auth();
  const userId = (authRes as { userId?: string | null }).userId ?? null;
  const orgId =
    (authRes as { orgId?: string | null }).orgId ??
    (authRes as { sessionClaims?: { org_id?: string } }).sessionClaims?.org_id ??
    null;
  if (!userId || !orgId) {
    return new Response("Unauthorized", { status: 401, headers: { "X-Content-Type-Options": "nosniff" } });
  }
  const getToken = (authRes as { getToken?: (opts?: unknown) => Promise<string | null> }).getToken;
  const token = getToken ? await getToken({ template: "convex" }).catch(() => null) : null;
  const client = convexClient(token);
  try {
    const doc = (await client.query(api.companyDocuments.getDocument, {
      documentId: documentId as Id<"companyDocuments">,
    })) as { fileName?: string; mime: string; scanState: string; storageId: string } | null;
    if (!doc) return new Response("Not found", { status: 404, headers: { "X-Content-Type-Options": "nosniff" } });
    if (doc.scanState === "deleted" || doc.scanState === "rejected") {
      return new Response("Not found", { status: 404, headers: { "X-Content-Type-Options": "nosniff" } });
    }
    const url = (await client.action(api.companyDocuments.getDownloadUrl, {
      documentId: documentId as Id<"companyDocuments">,
    })) as string | null;
    if (!url) return new Response("Not found", { status: 404, headers: { "X-Content-Type-Options": "nosniff" } });
    const upstream = await fetch(url);
    if (!upstream.ok || !upstream.body) return new Response("Not found", { status: 404, headers: { "X-Content-Type-Options": "nosniff" } });
    const buf = await upstream.arrayBuffer();
    const headers = new Headers();
    headers.set("Content-Type", doc.mime);
    headers.set("Content-Disposition", disposition(doc.fileName ?? `${documentId}.bin`));
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Cache-Control", "private, max-age=0, must-revalidate");
    headers.set("Content-Length", String(buf.byteLength));
    return new Response(buf, { status: 200, headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("UNAUTHORIZED")) return new Response("Unauthorized", { status: 401, headers: { "X-Content-Type-Options": "nosniff" } });
    if (msg.includes("NOT_FOUND")) return new Response("Not found", { status: 404, headers: { "X-Content-Type-Options": "nosniff" } });
    if (msg.includes("FORBIDDEN")) return new Response("Not found", { status: 404, headers: { "X-Content-Type-Options": "nosniff" } });
    return new Response("Service unavailable", { status: 503, headers: { "X-Content-Type-Options": "nosniff" } });
  }
}
