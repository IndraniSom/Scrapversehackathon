/**
 * Convex structured observability helper.
 *
 * Mirrors FastAPI/Next.js structured log fields for trace correlation.
 * Hashes identities and never logs prompts, document text, or tokens.
 */

/**
 * Hash an identifier for safe logging using truncated SHA-256.
 *
 * Falls back to length-based hash when crypto is unavailable.
 */
export async function hashForLog(value: string): Promise<string> {
  if (!value) return "unknown";
  try {
    const data = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 12);
  } catch {
    let h = 0;
    for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
    return h.toString(16).padStart(8, "0");
  }
}

/**
 * Structured log shape shared across Convex, Next.js, and FastAPI.
 */
export type StructuredLog = {
  timestamp: string;
  environment: string;
  service: "convex";
  traceId: string;
  orgHash: string;
  userHash: string;
  jobId: string;
  action: string;
  status: "ok" | "error";
  durationMs?: number;
  errorCode?: string;
};

/**
 * Emit a JSON structured log line for Convex function execution.
 *
 * Includes trace, hashed org/user, jobId, duration, and safe error code.
 */
export async function logConvex(
  args: {
    traceId: string;
    organizationId?: string;
    userId?: string;
    jobId?: string;
    action: string;
    status: "ok" | "error";
    durationMs?: number;
    errorCode?: string;
  },
): Promise<void> {
  const orgHash = await hashForLog(args.organizationId ?? "");
  const userHash = await hashForLog(args.userId ?? "");
  const entry: StructuredLog = {
    timestamp: new Date().toISOString(),
    environment: process.env.CONVEX_CLOUD_URL ? "production" : "development",
    service: "convex",
    traceId: args.traceId,
    orgHash,
    userHash,
    jobId: args.jobId ?? "none",
    action: args.action,
    status: args.status,
    durationMs: args.durationMs,
    errorCode: args.errorCode,
  };
  console.log(JSON.stringify(entry));
}

/**
 * Extract trace identifier from Convex action headers or generate one.
 */
export function traceFromHeaders(headers: Record<string, string>): string {
  return headers["x-trace-id"] ?? headers["x-request-id"] ?? `gen-${Date.now().toString(36)}`;
}
