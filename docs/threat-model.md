# Threat Model — BidRadar Full Platform

Date: 2026-08-21 · Scope: Task 29 · Status: hardened · Limit: <200 lines.

## Trust boundaries

Browser ↔ Next.js ↔ Convex ↔ FastAPI worker ↔ Bright Data/DeepSeek/Resend ↔ Storage. Every boundary validates, authorizes, and cites source hashes.

## Vectors, mitigations, verification

### 1. Authentication
Clerk JWT issuer+appID verified in `auth.config.ts`; `proxy.ts` protects product routes; `http.ts` Svix verifies webhooks. Step-up required for org deletion, proposal lock, submission approval. Tests: unauthenticated/idle org denied.

### 2. Tenant isolation
Every table has `organizationId` + `by_organization` index; `requireOrganization`/`requirePermission` gates every function; job tokens bound to `organizationId`; vector search filters on `organizationId`. Tests: two-tenant isolation, cross-tenant 403, not-found masking.

### 3. Upload abuse
Allow PDF/DOCX ≤15 MB, magic-byte check, double-extension reject, SHA-256 dedupe, quarantine→scan→approved, controlled download proxy with `nosniff`. Limits: 10/min/org, 20/min/global. Verify spoofed MIME rejected.

### 4. SSRF
Collector allowlist `(CPPP, WBT, NTPC, ODISH)` + exact URL validator (`source_provider.py`); fetch via allowlisted `httpx` with no redirect to private IP (127/10/172.16/192.168/metadata); timeout 8 s; hash logged. Test: private IP and credential-bearing URL rejected.

### 5. Parser exploits
`DocumentLimits` 25 MB/80 pages/8k chars; `parse_pdf` catches `DECOMPRESSION_LIMIT/CORRUPT/ENCRYPTED`; OCR isolated process with CPU/memory/time caps; temp files deleted in `finally`. Verify decompression bomb returns `DECOMPRESSION_LIMIT` not 500.

### 6. Webhook spoofing
Svix `wh.verify(payload, headers)` + `signatureId` idempotency (`webhookDeliveries`); stale event rejected; 400 on bad signature. Tests duplicate delivery returns ok duplicate true.

### 7. Prompt injection
Documents untrusted input; DeepSeek JSON mode no tools; prompt is delimited `---DOCUMENT CHUNK---`; output validated by Pydantic + evidence location on normalized page; injection text flagged as review candidate. No tool calls.

### 8. RAG poisoning
`chunkEmbeddings` tenant+document+language filters; vector index 768-d e5 `query:` prefix; retrieval hydrates only `organizationId` chunks; every AI sentence cites `digest + page`. Cross-tenant RAG returns 0 results.

### 9. Excessive agency
Model receives bounded chunks only; Convex denies `ai_*` identities for `proposal.*`, `submission.*`, `export`, `delete`; allowlisted `JobKind` closed enum; human approval+step-up gates submission. Verify AI token gets `FORBIDDEN`.

### 10. Export leakage
Export jobs tenant-checked, digest + storageId bound, audit logged; ZIP/CSV/PDF/DOCX include revision hash; cross-tenant read returns `NOT_FOUND`. Rate 10/min/org.

### 11. Submission misuse
`ALLOWED_PORTALS` allowlist, `isOfficialUrl` https-only, checklist (serverClock, emd, signing, filenames), step-up+approval, stale digest conflict, duplicate receipt 409, immutable receipt, no `submit` tool; manual freeze-bid only. Tests checklist gate.

## Headers & CORS

CSP `default-src 'self'` + Clerk/Convex allowlist, HSTS 63072000 preload, `X-Frame-Options DENY`, `nosniff`, `strict-origin-when-cross-origin`, `Permissions-Policy` none, CORP same-origin, CORS allowlist `BIDRADAR_ALLOWED_ORIGINS` else deny.

## Rate limits (per-route/org)

Uploads 10/min/ org, search 60, AI 20, exports 10, webhooks 30, general 120; `@convex-dev/rate-limiter` + FastAPI in-memory sliding window 429 `RATE_LIMITED`. Admin kill switch via `convex.config`.

## CI scans

`pnpm audit --audit-level high`, `pip-audit`, secret scan `tools/check_sensitive_patterns.py` (no echo), SAST `ruff check` + `eslint`, secret IaC check `checkov` (Dockerfile, compose), container `trivy` — all in `.github/workflows/ci.yml` required gate.

## Residual risks

Collection approval withdrawal needs manual proof replacement; excerpts are public evidence not mirroring permission; OCR model cost spike needs quota alerts.

## Review

Skeptical review 2026-08-21: verified 2-tenant isolation, upload spoofs, SSRF private IP, decompression bomb, webhook bad sig, prompt injection, RAG filter, AI agency, export cross-tenant, submission checklist — all mitigated. Findings recorded here before fix.
