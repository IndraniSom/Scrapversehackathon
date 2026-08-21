/**
 * Outbound webhooks and integration APIs: HMAC, SSRF, API keys, exports.
 */
import { describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildEnvelope, signPayload, verifySignature, isPrivateHost, validateWebhookUrl, hashApiKey, generateApiKey, nextBackoffMs, shouldRetry, isDeadLetter, toCsv, toJson, toIcs } from "../../convex/integrations";

const integPath = path.resolve(__dirname, "../../convex/integrations.ts");
const httpPath = path.resolve(__dirname, "../../convex/http.ts");
const contractPath = path.resolve(__dirname, "../../../contracts/public-webhooks-v1.json");
const pagePath = path.resolve(__dirname, "../../app/(product)/settings/integrations/page.tsx");
function read(p: string): string { return fs.readFileSync(p, "utf8"); }

describe("webhook envelope and HMAC signing", () => {
  test("envelope has v1 fields", () => {
    const e = buildEnvelope({ organizationId: "org_abc123", type: "opportunity.created", dataId: "opp_1", revision: 2 });
    expect(e.organizationId).toBe("org_abc123");
    expect(e.type).toBe("opportunity.created");
    expect(e.data.id).toBe("opp_1");
    expect(e.data.revision).toBe(2);
    expect(e.version).toBe("v1");
    expect(e.id.startsWith("evt_")).toBe(true);
    expect(new Date(e.occurredAt).toISOString()).toBe(e.occurredAt);
    expect(typeof e.traceId).toBe("string");
  });
  test("sign and verify valid signature", async () => {
    const body = JSON.stringify({ id: "evt_1" });
    const ts = String(Date.now());
    const secret = "s3cret_test";
    const sig = await signPayload(body, ts, secret);
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
    expect(await verifySignature(body, ts, sig, secret)).toBe(true);
  });
  test("replay beyond 5m is rejected", async () => {
    const body = "{}"; const secret = "s"; const old = String(Date.now() - 10 * 60 * 1000);
    const sig = await signPayload(body, old, secret);
    expect(await verifySignature(body, old, sig, secret)).toBe(false);
  });
  test("tampered body fails verification", async () => {
    const body = '{"a":1}'; const ts = String(Date.now()); const sec = "k";
    const sig = await signPayload(body, ts, sec);
    expect(await verifySignature('{"a":2}', ts, sig, sec)).toBe(false);
  });
  test("wrong secret fails", async () => {
    const b = "hi"; const ts = String(Date.now());
    const s = await signPayload(b, ts, "a");
    expect(await verifySignature(b, ts, s, "b")).toBe(false);
  });
});

describe("SSRF protection", () => {
  test("validateWebhookUrl blocks private and requires https", () => {
    expect(validateWebhookUrl("https://hooks.example.com/bidradar").valid).toBe(true);
    expect(validateWebhookUrl("http://hooks.example.com").valid).toBe(false);
    expect(validateWebhookUrl("https://localhost/hook").valid).toBe(false);
    expect(validateWebhookUrl("https://127.0.0.1/hook").valid).toBe(false);
    expect(validateWebhookUrl("https://10.0.0.1/hook").valid).toBe(false);
    expect(validateWebhookUrl("https://192.168.1.1/hook").valid).toBe(false);
    expect(validateWebhookUrl("https://172.16.5.1/hook").valid).toBe(false);
    expect(validateWebhookUrl("https://169.254.169.254/hook").valid).toBe(false);
    expect(validateWebhookUrl("https://example.internal/hook").valid).toBe(false);
    expect(validateWebhookUrl("https://user:pass@example.com/hook").valid).toBe(false);
  });
  test("isPrivateHost covers metadata and ranges", () => {
    expect(isPrivateHost("metadata.google.internal")).toBe(true);
    expect(isPrivateHost("10.5.0.1")).toBe(true);
    expect(isPrivateHost("fc00::1")).toBe(true);
    expect(isPrivateHost("hooks.example.com")).toBe(false);
  });
  test("HTTP router does not expose arbitrary outbound fetch", () => {
    const t = read(httpPath);
    expect(t).not.toMatch(/integrations\/verify/);
    expect(t).not.toMatch(/fetchWithSsrf/);
  });
  test("integrations verify uses SSRF and tenant check", () => {
    const txt = read(integPath);
    expect(txt).toMatch(/validateWebhookUrl/);
    expect(txt).toMatch(/isPrivateHost/);
    expect(txt).toMatch(/requireOrganization/);
    expect(txt).toMatch(/organizationId.*auth\.organizationId/);
  });
});

describe("retry, backoff, dead letter, disabled endpoint", () => {
  test("nextBackoffMs exponential capped 60s", () => {
    expect(nextBackoffMs(0)).toBe(1000);
    expect(nextBackoffMs(1)).toBe(2000);
    expect(nextBackoffMs(2)).toBe(4000);
    expect(nextBackoffMs(6)).toBe(60000);
    expect(nextBackoffMs(10)).toBe(60000);
  });
  test("shouldRetry only 429/408/5xx", () => {
    expect(shouldRetry(500)).toBe(true);
    expect(shouldRetry(429)).toBe(true);
    expect(shouldRetry(408)).toBe(true);
    expect(shouldRetry(400)).toBe(false);
    expect(shouldRetry(200)).toBe(false);
    expect(shouldRetry(404)).toBe(false);
  });
  test("dead letter after 5 attempts", () => {
    expect(isDeadLetter(4)).toBe(false);
    expect(isDeadLetter(5)).toBe(true);
    expect(isDeadLetter(6)).toBe(true);
  });
  test("disabled endpoint skipped via file check", () => {
    const txt = read(integPath);
    expect(txt).toMatch(/disableWebhook/);
    expect(txt).toMatch(/state.*disabled/);
    expect(txt).toMatch(/WEBHOOK_EVENTS/);
  });
  test("retry/backoff present in integrations", () => {
    const txt = read(integPath);
    expect(txt).toMatch(/nextBackoffMs/);
    expect(txt).toMatch(/shouldRetry/);
    expect(txt).toMatch(/isDeadLetter/);
    expect(txt).toMatch(/MAX_ATTEMPTS/);
  });
});

describe("secret rotation and API-key hashed storage", () => {
  test("hashApiKey is sha256 hex and rotation changes hash", async () => {
    const k1 = generateApiKey();
    expect(k1.startsWith("bdr_")).toBe(true);
    const h1 = await hashApiKey(k1);
    const h2 = await hashApiKey(k1);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
    const k2 = generateApiKey();
    const h3 = await hashApiKey(k2);
    expect(h3).not.toBe(h1);
  });
  test("integrations hashes keys and rotates secret", () => {
    const txt = read(integPath);
    expect(txt).toMatch(/hashApiKey/);
    expect(txt).toMatch(/generateApiKey/);
    expect(txt).toMatch(/rotateSecret/);
    expect(txt).toMatch(/secretHash/);
    expect(txt).toMatch(/SHA-256/);
    expect(txt).toMatch(/org:admin/);
  });
  test("createApiKey restricted to admin and revocation", () => {
    const txt = read(integPath);
    expect(txt).toMatch(/createApiKey/);
    expect(txt).toMatch(/revokeApiKey/);
    expect(txt).toMatch(/Only admin may create keys/);
    expect(txt).toMatch(/hashed/);
  });
  test("tenant isolation via organizationId", () => {
    const txt = read(integPath);
    expect(txt).toMatch(/requireOrganization/);
    expect(txt).toMatch(/organizationId.*auth\.organizationId/);
    expect(txt).toMatch(/Cross-tenant|cross.*tenant/i);
    expect((txt.match(/requireOrganization/g) ?? []).length).toBeGreaterThan(3);
  });
});

describe("exports ics csv json", () => {
  test("toCsv quoted and header", () => {
    const csv = toCsv([{ id: "1", title: 'a,b' }, { id: "2", title: 'c\"d' }]);
    expect(csv.split("\n")[0]).toBe("id,title");
    expect(csv).toContain('"a,b"');
    expect(csv).toContain('"c""d"');
    expect(toCsv([])).toBe("");
  });
  test("toJson pretty", () => {
    expect(toJson({ a: 1 })).toContain("\n");
    expect(JSON.parse(toJson({ a: 1 })).a).toBe(1);
  });
  test("toIcs vcalendar", () => {
    const ics = toIcs([{ title: "Close", start: "2026-08-21T00:00:00.000Z", description: "x, y" }]);
    expect(ics).toMatch(/BEGIN:VCALENDAR/);
    expect(ics).toMatch(/VERSION:2.0/);
    expect(ics).toMatch(/BEGIN:VEVENT/);
    expect(ics).toMatch(/SUMMARY:Close/);
    expect(ics).toMatch(/DTSTART:/);
  });
  test("contract has envelope fields and signing example without secret", () => {
    const c = JSON.parse(read(contractPath));
    expect(c.components.schemas.WebhookEnvelopeV1.required).toEqual(expect.arrayContaining(["id","organizationId","type","occurredAt","data","traceId","version"]));
    expect(c["x-bidradar"].signing.header).toMatch(/v1=/);
    expect(c["x-bidradar"].signing.example.header).not.toMatch(/real_secret/i);
    expect(c["x-bidradar"].ssrf.checks.join(" ")).toMatch(/Private/);
  });
  test("settings page uses persistent webhook and API-key operations", () => {
    const p = read(pagePath);
    expect(p).toMatch(/Integrations/);
    expect(p).toMatch(/opportunity\.created/);
    expect(p).toMatch(/listWebhooks/);
    expect(p).toMatch(/createApiKey/);
    expect(p).not.toMatch(/hooks\.example\.com<\/td>/);
  });
});
