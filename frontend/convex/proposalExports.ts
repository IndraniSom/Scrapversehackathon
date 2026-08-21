"use node";

/** Signed proposal-package rendering and Convex storage orchestration. */
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { throwValidation } from "./lib/errors";

/** Computes exact-body FastAPI worker signature. */
async function sign(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `sha256=${Buffer.from(signature).toString("hex")}`;
}

/** Renders, verifies, stores, and registers one submission ZIP. */
export const createSubmissionPackage = action({
  args: { proposalId: v.id("proposalProjects") },
  handler: async (ctx, args): Promise<{ exportId: Id<"exportJobs">; submissionId: Id<"submissionPackages">; digest: string }> => {
    const input = await ctx.runQuery(internal.proposalExportData.prepare, args);
    const baseUrl = process.env.BIDRADAR_WORKER_BASE_URL;
    const secret = process.env.BIDRADAR_WORKER_HMAC_SECRET;
    if (!baseUrl || !secret) throwValidation("Proposal export worker is unavailable.");
    const body = JSON.stringify(input.body);
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/internal/v1/proposal-package`, { method: "POST", headers: { "Content-Type": "application/json", "X-Worker-Signature": await sign(body, secret) }, body });
    const payload: unknown = await response.json();
    if (!response.ok || !payload || typeof payload !== "object" || !("archive" in payload) || !("digest" in payload) || typeof payload.archive !== "string" || typeof payload.digest !== "string" || !/^[a-f0-9]{64}$/.test(payload.digest)) throwValidation("Proposal export worker returned invalid output.");
    const bytes = Buffer.from(payload.archive, "base64");
    const storageId = await ctx.storage.store(new Blob([bytes], { type: "application/zip" }), { sha256: payload.digest });
    const stored = await ctx.runMutation(internal.proposalExportData.store, { organizationId: input.organizationId, userId: input.userId, proposalId: args.proposalId, storageId, digest: payload.digest, sourceRevision: input.body.revision });
    return { ...stored, digest: payload.digest };
  },
});
