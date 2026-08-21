/** Clerk-reverified server bridge for submission handoff preparation. */
import { auth, reverificationErrorResponse } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const inputSchema = z.strictObject({ portal: z.string().min(1), officialUrl: z.url(), serverClockAcknowledged: z.boolean(), emdVerified: z.boolean(), signingVerified: z.boolean(), filenamesVerified: z.boolean(), packageDigest: z.string().regex(/^[a-f0-9]{64}$/i) });

/** Verifies recent Clerk credentials and forwards exact package action to Convex. */
export async function POST(request: Request, { params }: { params: Promise<{ submissionId: string }> }): Promise<Response> {
  const { submissionId } = await params;
  const session = await auth();
  if (!session.userId || !session.orgId) return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  if (!session.has({ reverification: "strict" })) return reverificationErrorResponse("strict");
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  const token = await session.getToken();
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!parsed.success) return Response.json({ code: "VALIDATION_FAILED" }, { status: 422 });
  if (!token || !convexUrl) return Response.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  try {
    const client = new ConvexHttpClient(convexUrl);
    const result = await client.action(api.submissionVerification.prepareHandoff, { sessionToken: token, packageId: submissionId as Id<"submissionPackages">, ...parsed.data });
    return Response.json(result);
  } catch {
    return Response.json({ code: "HANDOFF_REJECTED" }, { status: 403 });
  }
}
