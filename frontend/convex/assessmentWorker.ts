/** Internal FastAPI assessment execution with signed requests and stale-result gates. */
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

type WorkerResult = {
  recommendation: "BID" | "REVIEW" | "NO_BID";
  counts: { pass: number; fail: number; unknown: number };
  rules: Array<{ rule_id: string; evaluation: "PASS" | "FAIL" | "UNKNOWN" | "NOT_APPLICABLE"; actual: string | null; expected: string | null; explanation: string; evidence: string[] }>;
};

/** Computes exact-body worker signature. */
async function sign(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return `sha256=${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** Validates minimal closed worker response before persistence validators run. */
function workerResult(value: unknown): WorkerResult | null {
  if (!isRecord(value) || !isRecord(value.counts) || !Array.isArray(value.rules)) return null;
  const recommendation = parseRecommendation(value.recommendation);
  if (recommendation === null) return null;
  const counts = { pass: Number(value.counts.pass), fail: Number(value.counts.fail), unknown: Number(value.counts.unknown) };
  if (Object.values(counts).some((count) => !Number.isInteger(count) || count < 0)) return null;
  const rules: WorkerResult["rules"] = [];
  for (const rule of value.rules) {
    if (!isRecord(rule) || typeof rule.rule_id !== "string" || typeof rule.explanation !== "string" || !Array.isArray(rule.evidence) || !rule.evidence.every((entry) => typeof entry === "string")) return null;
    const evaluation = parseEvaluation(rule.evaluation);
    if (evaluation === null) return null;
    if (rule.actual !== null && typeof rule.actual !== "string") return null;
    if (rule.expected !== null && typeof rule.expected !== "string") return null;
    rules.push({ rule_id: rule.rule_id, evaluation, actual: rule.actual, expected: rule.expected, explanation: rule.explanation, evidence: rule.evidence });
  }
  return { recommendation, counts, rules };
}

/** Parses one closed recommendation literal. */
function parseRecommendation(value: unknown): WorkerResult["recommendation"] | null {
  if (value === "BID" || value === "REVIEW" || value === "NO_BID") return value;
  return null;
}

/** Parses one closed four-state evaluation literal. */
function parseEvaluation(value: unknown): WorkerResult["rules"][number]["evaluation"] | null {
  if (value === "PASS" || value === "FAIL" || value === "UNKNOWN" || value === "NOT_APPLICABLE") return value;
  return null;
}

/** Narrows unknown JSON objects without accepting arrays. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Executes one queued assessment through signed FastAPI and persists exact results. */
export const execute = internalAction({
  args: { jobId: v.id("jobs"), companyId: v.id("companies"), opportunityId: v.id("opportunities"), requirementSetId: v.id("requirementSets"), asOf: v.number() },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.jobs.dispatchJob, { jobId: args.jobId });
    try {
      const input = await ctx.runQuery(internal.assessmentInputs.load, args);
      const baseUrl = process.env.BIDRADAR_WORKER_BASE_URL;
      const secret = process.env.BIDRADAR_WORKER_HMAC_SECRET;
      if (!baseUrl || !secret) throw new Error("WORKER_UNAVAILABLE");
      const body = JSON.stringify(input.body);
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/internal/v1/assessments`, { method: "POST", headers: { "Content-Type": "application/json", "X-Worker-Signature": await sign(body, secret) }, body });
      const result = workerResult(await response.json());
      if (!response.ok || !result) throw new Error("INVALID_WORKER_RESULT");
      const assessmentId = await ctx.runMutation(internal.assessmentInputs.store, { jobId: args.jobId, companyId: args.companyId, opportunityId: args.opportunityId, requirementSetRevision: input.requirementSetRevision, asOf: args.asOf, ...result });
      await ctx.runMutation(internal.jobs.completeJob, { jobId: args.jobId, inputRevision: input.inputRevision, inputHashes: input.inputHashes, traceId: input.traceId, outputRefs: [String(assessmentId)] });
    } catch (error) {
      await ctx.runMutation(internal.jobs.failJob, { jobId: args.jobId, retryable: true, safeFailureCode: error instanceof Error && error.message === "WORKER_UNAVAILABLE" ? "WORKER_UNAVAILABLE" : "ASSESSMENT_FAILED" });
    }
  },
});
