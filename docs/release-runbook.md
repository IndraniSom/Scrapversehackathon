# BidRadar Release Runbook

Release state: **READY_FOR_FINAL_REVIEW**. Only two final reviewer PASS verdicts and final security approval remain pending.

## Preconditions

- Run from the repository root with Python 3.13/uv, Node.js, pnpm, and the frozen locks installed.
- Contract SHA-256 must be `bb7df948805027b7325d243a094e48f290371547ae39c2dfd27de093414ca2b1`.
- The runtime does not require Bright Data or model credentials. Do not place credentials in commands or logs.
- Demo data is immutable under `backend/data/demo/`; selected ID is `ocac-pond-monitoring-26001`.

## Automated rehearsals

Normal-network rehearsal, including a fresh production build:

```bash
cd backend
uv run python ../tools/smoke_demo.py --mode normal
```

Proxy-denied offline rehearsal, also with a fresh build:

```bash
cd backend
uv run python ../tools/smoke_demo.py --mode offline
```

Both modes remove `BRIGHT_DATA_API_TOKEN`, `BRIGHT_DATA_COLLECTOR_ID`, `DEEPSEEK_API_KEY`, and `OPENAI_API_KEY`, start Uvicorn and `pnpm start` on free loopback ports, verify four API and three frontend routes, and terminate both process groups on success or failure. Offline mode overwrites uppercase and lowercase HTTP/HTTPS/ALL proxy variables with a closed loopback proxy while preserving both localhost no-proxy variables. This is strong application-level evidence that the runtime makes no proxy-aware external request; it is not a kernel network-namespace proof.

Observed on 2026-08-21:

- automated normal: 4.40 seconds;
- automated offline proxy-denied: 4.14 seconds;
- ceiling enforced by the tool: 420 seconds.

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

| Time | Action and required truthful marker |
|---|---|
| 0:00-0:45 | Open `http://127.0.0.1:3000/`. State that this is decision support, not legal advice or bid submission. Show seven rows: 2 CPPP, 2 West Bengal, 2 NTPC, 1 Odisha. |
| 0:45-1:45 | Open Source proof details. Show `VERIFIED`, `RECORDED_BRIGHT_DATA_SNAPSHOT`, chosen run `j_mt0i928kyu57telkk`, and raw SHA-256 `b7ff42dfef9c3a12cd043ee0a23394158d9f9800a12407938a07dccd1ee11aef`. Do not call it live. |
| 1:45-2:30 | Identify the assessed OCAC row as `MANUAL_FIXTURE`; explain that official document authenticity does not turn a hand-authored opportunity selector into provider proof. |
| 2:30-4:15 | Open `/opportunities/ocac-pond-monitoring-26001`. Show base `NO_BID` with one failure/three UNKNOWN and amended `REVIEW` with zero failures/three UNKNOWN. Explain that the authority never states certification validity anchors. |
| 4:15-5:45 | Open the amendment view. Show `AUTHORITY`, `ACCEPTED`, effective replacement, base hash `f1bc…7afd`, amendment hash `ccbe…57a1`, and the ₹12 crore to ₹6 crore turnover change. |
| 5:45-6:30 | Explain unchanged ISO 9001, ISO 27001, and CMMI evidence, why all remain UNKNOWN, and that only the reviewed turnover clause changes. |
| 6:30-7:00 | State limitations: one curated digital-text pair, one synthetic company, no OCR, no automated submission, portal reuse governed by recorded review, and broader evaluation remains post-hackathon. |

## Human rehearsal record - PASS

| Checkpoint | Normal Browser run | Offline proxy-denied/credentials-absent Browser run |
|---|---:|---:|
| Register | 5.104s | 5.102s |
| Proof | 10.399s | 10.403s |
| Assessment | 33.728s | 33.521s |
| Amendment | 43.791s | 43.582s |
| Limitations | 48.812s | 48.605s |
| End | 48.826s | 48.618s |

Both runs observed the exact seven-row/proof/NO_BID-to-REVIEW/authority/hash/limitation markers in the script, required no recovery, and completed below 420 seconds.

## Failure handling

- Any contract, startup, artifact, hash, audit, smoke, browser, or timing failure means `NOT_READY`.
- Never swap in a manual provider proof, rewrite a truth label, skip failed evidence, or continue with a partially loaded bundle.
- Backend stopped: frontend must show its explicit unavailable state; it must not substitute fixtures.
- Unknown opportunity: verify the safe 404 UI/envelope, with no traceback or internal path.
- Final REVIEW browser evidence and both exact human rehearsals passed; preserve their ledger/screenshots for final reviewers.
