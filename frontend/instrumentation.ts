/**
 * Next.js instrumentation for structured observability.
 *
 * Provides trace correlation across browser, Next.js, Convex,
 * FastAPI, Bright Data, DeepSeek, Resend, and exports.
 */

/** Initializes server-side observability hooks for Node runtime. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Node crypto is available only on server; no client import.
    // Global error and unhandled rejection hooks are registered here
    // to ensure trace-aware structured logs capture startup faults.
    process.on("unhandledRejection", (reason: unknown) => {
      logStructured({
        service: "frontend",
        action: "unhandledRejection",
        status: "error",
        errorCode: "UNHANDLED_REJECTION",
        traceId: "unknown",
        detail: String(reason).slice(0, 200),
      });
    });
  }
}

/**
 * Hash an identifier for safe logging without retaining PII.
 *
 * Uses SHA-256 truncation to 12 hex chars; irreversible for audit logs.
 */
async function hashIdentifier(value: string): Promise<string> {
  if (!value) return "unknown";
  // Use Web Crypto when available, else djb2 fallback (edge-safe, no node:crypto)
  try {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const data = new TextEncoder().encode(value);
      const hash = await crypto.subtle.digest("SHA-256", data);
      const bytes = new Uint8Array(hash);
      return Array.from(bytes.slice(0, 6)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch (error) {
    void error;
  }
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/**
 * Emit a JSON structured log line with required correlation fields.
 *
 * Fields: timestamp, environment, service, traceId, orgHash, userHash,
 * jobId, action, status, duration, errorCode. No credentials or bodies.
 */
function logStructured(fields: Record<string, unknown>): void {
  const entry = {
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    service: "frontend",
    traceId: "unknown",
    orgHash: "unknown",
    userHash: "unknown",
    jobId: "none",
    ...fields,
  };
  // Use json line for log aggregator ingestion.
  console.log(JSON.stringify(entry));
}

/**
 * Extract trace identifier from request headers for cross-service correlation.
 *
 * Checks traceparent, x-trace-id, x-request-id in priority order.
 */
function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/** Extracts trace ID from Next.js request header record. */
function extractTraceId(headers: Record<string, string | string[] | undefined>): string {
  return (
    headerValue(headers, "x-trace-id") ??
    headerValue(headers, "x-request-id") ??
    headerValue(headers, "traceparent")?.split("-")[1] ??
    `gen-${Date.now().toString(36)}`
  );
}

/**
 * Next.js request-error hook for server component and route failures.
 *
 * Logs typed error context with trace and hashed identity; never logs
 * prompt, document text, or token values.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const traceId = extractTraceId(request.headers);
  const orgHash = await hashIdentifier(headerValue(request.headers, "x-org-id") ?? "");
  const userHash = await hashIdentifier(headerValue(request.headers, "x-user-id") ?? "");
  const message = error instanceof Error ? error.message : String(error);
  logStructured({
    traceId,
    orgHash,
    userHash,
    action: `${context.routerKind}:${request.method} ${context.routePath}`,
    path: request.path,
    routeType: context.routeType,
    status: "error",
    errorCode: "NEXT_REQUEST_ERROR",
    detail: message.slice(0, 500),
  });
};
import type { Instrumentation } from "next";
