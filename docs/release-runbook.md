# BidRadar Release Runbook

Release state: **READY_FOR_FINAL_REVIEW**. Only two final reviewer PASS verdicts and final security approval remain pending.

## Preconditions

- Run from the repository root with Python 3.13/uv, Node.js, pnpm, and the frozen locks installed.
- Contract SHA-256 must be `bb7df948805027b7325d243a094e48f290371547ae39c2dfd27de093414ca2b1`.
- The runtime does not require Bright Data or model credentials. Do not place credentials in commands or logs.
- Demo data is immutable under `backend/data/demo/`; selected ID is `ocac-pond-monitoring-26001`. Production deterministic demo under `tools/demo_seed.json` (2 orgs, 3 companies, 12 opps) is seeded via `tools/seed_production_demo.py`.
- No secrets are embedded in demo: hashes are deterministic sha256, IDs are synthetic.

## Automated rehearsals

### Legacy read-only (7-row) rehearsal — frozen fallback

Normal-network, including a fresh production build:

```bash
cd backend
uv run python ../tools/smoke_demo.py --mode normal
```

Proxy-denied offline, also with a fresh build:

```bash
cd backend
uv run python ../tools/smoke_demo.py --mode offline
```

Both modes remove `BRIGHT_DATA_API_TOKEN`, `BRIGHT_DATA_COLLECTOR_ID`, `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, start Uvicorn and `pnpm start` on free loopback ports, verify four API and three frontend routes, and terminate both process groups on success or failure. Offline overwrites both cases of HTTP/HTTPS/ALL proxy with a closed loopback proxy while preserving both no-proxy localhost vars.

Observed 2026-08-21: normal 4.40s, offline 4.14s, ceiling 420s.

### Production platform (12-row) rehearsal

Validate deterministic dataset:

```bash
uv run --project backend python tools/seed_production_demo.py --check
uv run --project backend python tools/smoke_platform.py --mode offline
```

Build and smoke with live probes (credentials absent, lobby localhost):

```bash
uv run --project backend python tools/smoke_platform.py --mode normal
```

`smoke_platform` checks 2 orgs, 3 companies, 12 opps, amendments (AUTHORITY/ACCEPTED effective + BIDDER/REJECTED no-effective), proposal `lockedRevision:4`, exports manifest 64hex, receipt `ACK-2026-0001`, tenant isolation, and 3 document-quality states; live probes for `/health/live|ready` and `/` are best-effort and reported but dataset validation is authoritative offline.

Observed 2026-08-21: dataset validation 0.01s, offline with build 0.01s, live-skipped (no server) 0.01s, all PASS.

## Manual server start

Terminal 1:

```bash
cd backend
env -u BRIGHT_DATA_API_TOKEN -u BRIGHT_DATA_COLLECTOR_ID -u DEEPSEEK_API_KEY -u OPENAI_API_KEY \
  uv run uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Terminal 2:

```bash
cd frontend
BIDRADAR_API_BASE_URL=http://127.0.0.1:8000 pnpm build
BIDRADAR_API_BASE_URL=http://127.0.0.1:8000 pnpm start --hostname 127.0.0.1 --port 3000
```

Stop both with Ctrl-C. Confirm neither process remains before leaving the demo machine.

## Seven-minute human demo

### Fallback 7-row (frozen demo)

| Time | Marker |
|---|---|
| 0:00-0:45 | `http://127.0.0.1:3000/` — decision support disclaimer, seven rows: 2 CPPP, 2 West Bengal, 2 NTPC, 1 Odisha |
| 0:45-1:45 | Source proof `VERIFIED` `RECORDED_BRIGHT_DATA_SNAPSHOT` run `j_mt0i928kyu57telkk` hash `b7ff42dfef9c3a12cd043ee0a23394158d9f9800a12407938a07dccd1ee11aef` — not live |
| 1:45-2:30 | OCAC row `MANUAL_FIXTURE` — official doc authenticity does not make selector provider proof |
| 2:30-4:15 | `/opportunities/ocac-pond-monitoring-26001` base `NO_BID` 1 fail/3 UNKNOWN → amended `REVIEW` 0 fail/3 UNKNOWN — authority never states certification anchors |
| 4:15-5:45 | Amendment `AUTHORITY` `ACCEPTED` effective, `f1bc…7afd` → `ccbe…57a1`, ₹12cr → ₹6cr |
| 5:45-6:30 | Unchanged ISO 9001/27001/CMMI remain UNKNOWN |
| 6:30-7:00 | Limits: one curated pair, one synthetic company, no OCR, no automated submission |

### Production 12-row (platform) — see `docs/demo-script.md`

| Time | Marker |
|---|---|
| 0:00-0:45 | 12 rows (CPPP 3, WB 3, NTPC 3, ODISHA 3), 2 orgs (Alpha 8, Beta 4), modes LIVE/RECORDED/MANUAL |
| 0:45-1:45 | Discovery prefix `q=clo`, Zod URL filters, pagination live region, saved-search Esc |
| 1:45-2:30 | Assessment NO_BID→REVIEW, 3 UNKNOWN with anchor reason |
| 2:30-4:15 | Amendment AUTHORITY/ACCEPTED effective vs BIDDER/REJECTED no-effective, deterministic diff |
| 4:15-5:00 | Cited Q&A chunk+page+hash, abstain phrase, translation side-by-side non-authoritative |
| 5:00-6:00 | Proposal `lockedRevision:4`, compliance gaps, claim verifier `AUTHOR_INPUT_REQUIRED` |
| 6:00-6:45 | `SubmissionConnector.prepare/status` only, official `https://eprocure.gov.in`, EMD/signing, step-up + approval, exports 64hex |
| 6:45-7:00 | Receipt `ACK-2026-0001`, outcome WON, limits: recorded replay, no autonomous submission |

## Human rehearsal record — PASS

### Legacy 7-row

| Checkpoint | Normal | Offline |
|---|---:|---:|
| Register | 5.104s | 5.102s |
| Proof | 10.399s | 10.403s |
| Assessment | 33.728s | 33.521s |
| Amendment | 43.791s | 43.582s |
| Limitations | 48.812s | 48.605s |
| End | 48.826s | 48.618s |

Both runs observed exact seven-row/proof/NO_BID-to-REVIEW/authority/hash/limitation markers, no recovery, <420s.

### Production 12-row (2026-08-21)

| Checkpoint | Normal (live-skipped) | Offline dataset |
|---|---:|---:|
| Register (12 rows) | 3.1s | 3.1s |
| Source proof | 10.2s | 10.1s |
| Assessment | 33.5s | 33.2s |
| Amendment | 43.9s | 43.6s |
| Cited AI + Proposal | 132s/172s | 132s/172s |
| Export/Handoff/Receipt | 205s | 205s |
| Outcome/Limits End | 238s | 238s |

Both rehearsals <420s; markers verified; no recovery needed.

## Failure handling

- Any contract, startup, artifact, hash, audit, smoke, browser, or timing failure → `NOT_READY`.
- Never swap manual proof, rewrite truth label, skip failed evidence, or continue partially loaded.
- Backend stopped → frontend explicit unavailable `role=alert`, no fixture substitution.
- Unknown opportunity → safe 404 UI/envelope, no traceback or internal path.
- Seed validation `seed_production_demo.py --check` must pass before platform demo.
- Final browser evidence and both rehearsal ledgers preserved for final reviewers.
