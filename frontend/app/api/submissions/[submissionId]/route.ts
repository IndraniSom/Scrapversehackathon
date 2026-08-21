/** Permission-checked approved submission ZIP proxy. */
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/** Streams approved ZIP without exposing durable storage URL. */
export async function GET(_request: Request, { params }: { params: Promise<{ submissionId: string }> }): Promise<Response> {
  const { submissionId } = await params;
  if (!submissionId || submissionId.includes("/") || submissionId.includes("..")) return new Response("Invalid submission id", { status: 400 });
  const session = await auth();
  if (!session.userId || !session.orgId) return new Response("Unauthorized", { status: 401 });
  const token = await session.getToken({ template: "convex" });
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!token || !convexUrl) return new Response("Service unavailable", { status: 503 });
  const client = new ConvexHttpClient(convexUrl);
  client.setAuth(token);
  try {
    const url = await client.action(api.submissions.getDownloadUrl, { packageId: submissionId as Id<"submissionPackages"> });
    if (!url) return new Response("Not found", { status: 404 });
    const upstream = await fetch(url);
    if (!upstream.ok) return new Response("Not found", { status: 404 });
    const bytes = await upstream.arrayBuffer();
    return new Response(bytes, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="submission-${submissionId}.zip"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
