/**
 * Next.js instrumentation for structured observability.
 *
 * Provides trace correlation across browser, Next.js, Convex,
 * FastAPI, Bright Data, DeepSeek, Resend, and exports.
 */

export async function register(): Promise<void> {
  /** Initialize server-side observability hooks for Node runtime. */
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
  try {
    const { createHash } = await import("node:crypto");
    return createHash("sha256").update(value).digest("hex").slice(0, 12);
  } catch {
    // Fallback for edge runtime without node:crypto
    let h = 0;
    for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
    return h.toString(16).padStart(8, "0");
  }
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
function extractTraceId(headers: Headers): string {
  return (
    headers.get("x-trace-id") ??
    headers.get("x-request-id") ??
    headers.get("traceparent")?.split("-")[1] ??
    `gen-${Date.now().toString(36)}`
  );
}

/**
 * Next.js request-error hook for server component and route failures.
 *
 * Logs typed error context with trace and hashed identity; never logs
 * prompt, document text, or token values.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Headers },
  context: { routerKind: string; routePath: string; routeType: string },
): Promise<void> {
  const traceId = extractTraceId(request.headers);
  const orgHash = await hashIdentifier(request.headers.get("x-org-id") ?? "");
  const userHash = await hashIdentifier(request.headers.get("x-user-id") ?? "");
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
}
