/** Signed Bright Data webhook parsing and persistence. */
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { constantTimeEqual } from "./lib/keyComparison";

type ProviderRecord =
  | { sourceTenderId: string; title: string; authority: string; canonicalUrl: string; referenceNumber?: string }
  | { source_tender_id: string; title: string; authority: string; canonical_url: string; reference_number?: string };

/** Serializes JSON response without reflecting provider payloads. */
function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Returns non-empty string from untrusted webhook value. */
function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Parses closed provider records accepted by source normalization. */
function records(value: unknown): ProviderRecord[] | null {
  if (!Array.isArray(value)) return null;
  const parsed: ProviderRecord[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    const title = text(row.title);
    const authority = text(row.authority);
    const camelId = text(row.sourceTenderId);
    const camelUrl = text(row.canonicalUrl);
    const snakeId = text(row.source_tender_id);
    const snakeUrl = text(row.canonical_url);
    if (title === null || authority === null) return null;
    if (camelId !== null && camelUrl !== null) parsed.push({ sourceTenderId: camelId, title, authority, canonicalUrl: camelUrl, referenceNumber: text(row.referenceNumber) ?? undefined });
    else if (snakeId !== null && snakeUrl !== null) parsed.push({ source_tender_id: snakeId, title, authority, canonical_url: snakeUrl, reference_number: text(row.reference_number) ?? undefined });
    else return null;
  }
  return parsed;
}

/** Verifies exact-body HMAC-SHA256 signature. */
async function verify(body: string, signature: string | null, secret: string): Promise<boolean> {
  if (signature === null || secret.length === 0) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const expected = `sha256=${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  return constantTimeEqual(signature, expected);
}

/** Accepts verified provider results and stores exact raw payload bytes. */
export const brightDataWebhook = httpAction(async (ctx, request) => {
  const secret = process.env.BRIGHT_DATA_WEBHOOK_SECRET ?? "";
  if (secret.length === 0) return json({ code: "UNAUTHORIZED" }, 401);
  const body = await request.text();
  const signature = request.headers.get("x-brightdata-signature") ?? request.headers.get("x-webhook-signature");
  if (!await verify(body, signature, secret)) return json({ code: "UNAUTHORIZED" }, 401);
  let payload: unknown;
  try { payload = JSON.parse(body); } catch { return json({ code: "VALIDATION_FAILED" }, 400); }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return json({ code: "VALIDATION_FAILED" }, 400);
  const value = payload as Record<string, unknown>;
  const providerRunId = text(value.providerRunId);
  const connectorId = text(value.connectorId);
  const collectorVersion = text(value.collectorVersion);
  const digest = text(value.digest) ?? text(value.rawSnapshotHash);
  const startedAt = typeof value.startedAt === "number" ? value.startedAt : null;
  const completedAt = typeof value.completedAt === "number" ? value.completedAt : null;
  const status = value.status === "succeeded" || value.status === "failed" || value.status === "retryable" ? value.status : null;
  const parsedRecords = value.records === undefined ? undefined : records(value.records);
  if (providerRunId === null || connectorId === null || collectorVersion === null || digest === null || startedAt === null || completedAt === null || status === null || parsedRecords === null || completedAt < startedAt) return json({ code: "VALIDATION_FAILED" }, 400);
  const storageId = await ctx.storage.store(new Blob([body], { type: "application/json" }));
  await ctx.runMutation(internal.sourceRuns.handleWebhook, { connectorId, providerRunId, collectorVersion, startedAt, completedAt, rawSnapshotHash: digest, digest, status, records: parsedRecords, storageId, failureCode: text(value.failureCode) ?? undefined });
  return json({ ok: true, providerRunId }, 200);
});
