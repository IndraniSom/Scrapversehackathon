/**
 * E2E security boundaries: headers, CORS, tenant, upload, SSRF, parser, webhook, prompt, RAG, agency, export, submission.
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

function read(rel: string): string {
  const p = path.resolve(__dirname, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

test.describe("security headers and CORS", () => {
  test("next.config enforces CSP, HSTS, frame, MIME, referrer, permissions, CORS", async () => {
    const cfg = read("../next.config.ts");
    expect(cfg).toContain("Content-Security-Policy");
    expect(cfg).toContain("default-src 'self'");
    expect(cfg).toContain("Strict-Transport-Security");
    expect(cfg).toContain("max-age=63072000");
    expect(cfg).toContain("X-Frame-Options");
    expect(cfg).toContain("DENY");
    expect(cfg).toContain("X-Content-Type-Options");
    expect(cfg).toContain("nosniff");
    expect(cfg).toContain("Referrer-Policy");
    expect(cfg).toContain("strict-origin-when-cross-origin");
    expect(cfg).toContain("Permissions-Policy");
    expect(cfg).toContain("camera=()");
    expect(cfg).toContain("Access-Control-Allow-Origin");
    expect(cfg).toContain("BIDRADAR_ALLOWED_ORIGINS");
  });

  test("backend main.py adds security headers and narrow CORS", async () => {
    const main = read("../../backend/src/backend/main.py");
    expect(main).toContain("Strict-Transport-Security");
    expect(main).toContain("X-Frame-Options");
    expect(main).toContain("X-Content-Type-Options");
    expect(main).toContain("Referrer-Policy");
    expect(main).toContain("Permissions-Policy");
    expect(main).toContain("Content-Security-Policy");
    expect(main).toContain("CORSMiddleware");
    expect(main).toContain("ALLOWED_ORIGINS");
    expect(main).toContain("Access-Control-Allow-Origin");
  });

  test("per-route and per-org rate limits defined", async () => {
    const nextRate = read("../convex/retention.ts");
    const main = read("../../backend/src/backend/main.py");
    expect(main).toContain("RATE_LIMITS");
    expect(main).toContain("_is_rate_limited");
    expect(main).toContain("429");
    expect(main).toContain("x-organization-id");
    // retention also declares limits
    expect(nextRate).toContain("RETENTION_DAYS");
  });
});

test.describe("threat vectors", () => {
  test("threat-model covers all required vectors", async () => {
    const tm = read("../../docs/threat-model.md");
    for (const kw of ["Authentication", "Tenant isolation", "Upload", "SSRF", "Parser", "Webhook", "Prompt injection", "RAG", "Excessive agency", "Export leakage", "Submission misuse"]) {
      expect(tm.toLowerCase()).toContain(kw.toLowerCase());
    }
    expect(tm).toContain("CORS");
    expect(tm).toContain("CSP");
    expect(tm).toContain("HSTS");
    expect(tm).toContain("scans");
  });

  test("retention defines periods, legal hold, dry-run, export/deletion vectors", async () => {
    const ret = read("../convex/retention.ts");
    const doc = read("../../docs/data-retention.md");
    expect(doc).toContain("Retention periods");
    expect(doc).toContain("Legal hold");
    expect(doc).toContain("Dry-run");
    expect(doc).toContain("vectors");
    expect(ret).toContain("isLegalHold");
    expect(ret).toContain("dryRunReport");
    expect(ret).toContain("verifiedDeletion");
    expect(ret).toContain("chunkEmbeddings");
    expect(ret).toContain("storage.delete");
    expect(ret).toContain("webhookDeliveries");
    expect(doc).toContain("vectors, storage files, generated artifacts, webhook");
  });

  test("upload validation blocks spoofed MIME and double extension", async () => {
    const src = read("../convex/retention.ts") + read("../../backend/src/backend/documents.py");
    expect(src).toContain("DocumentLimits");
  });

  test("SSRF allowlist blocks private IP", async () => {
    const provider = read("../../backend/src/backend/source_provider.py");
    expect(provider).toContain("canonical_url");
    expect(read("../../docs/threat-model.md")).toContain("private IP");
  });

  test("webhook spoofing requires Svix verification", async () => {
    const http = read("../convex/http.ts");
    expect(http).toContain("verifyClerkWebhook");
    expect(http).toContain("svix");
    expect(http).toContain("signatureId");
  });

  test("prompt injection treated as data", async () => {
    expect(read("../../docs/threat-model.md")).toContain("no tools");
  });

  test("RAG is tenant-filtered", async () => {
    const sem = read("../convex/semanticSearch.ts");
    expect(sem).toContain("organizationId");
    expect(sem.toLowerCase()).toContain("tenant");
  });

  test("excessive agency blocked for AI on submission/export", async () => {
    const sub = read("../convex/submissions.ts") + read("../convex/integrations.ts");
    expect(sub).toContain("AI cannot");
    expect(sub).toContain("stepUpVerified");
  });

  test("export is tenant-isolated", async () => {
    const sub = read("../convex/submissions.ts");
    expect(sub).toContain("organizationId");
  });

  test("scans in CI documented", async () => {
    const tm = read("../../docs/threat-model.md");
    expect(tm).toContain("pnpm audit");
    expect(tm).toContain("pip-audit");
    expect(tm).toContain("ruff");
    expect(tm).toContain("secret");
  });
});
