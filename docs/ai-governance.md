# AI Governance — BidRadar

Aligned to **NIST AI RMF** (Govern, Map, Measure, Manage). All AI outputs are proposals until verified or human-approved.

## Roles

| Role | Responsibility |
|---|---|
| org:admin | Enable/disable features, choose models, approve evaluation gate |
| org:bid_manager | Review matrices, proposals, amendment impacts |
| org:reviewer | Verify citations, resolve unsupported claims |
| Engineer | Maintain eval sets, metrics, rollback |

## Governed features

`extraction`, `citations`, `qa`, `compliance`, `claims`, `amendment_mapping`. Each has a kill switch at `/settings/ai` (org:admin only). Model allowlist: `deepseek-v4-flash` (routine), `deepseek-v4-pro` (complex fallback). No AI sets `BID/REVIEW/NO_BID` directly.

## Known limits

- Extraction uses bounded PDF text; scanned docs need OCR.
- Retrieval is tenant-filtered; cross-tenant cited chunks are rejected.
- Every factual block requires a cited chunk/page; ungrounded text is marked `AUTHOR_INPUT_REQUIRED`.
- Translations are non-authoritative; originals remain normative.

## Evaluation

**Datasets:** `backend/tests/evaluation_cases/*.json` (extraction, citations, QA, compliance, claims, amendment_mapping) — labeled, versioned.

**Metrics:** schema validity, citation precision, citation recall, excerpt location, unsupported-claim rate, abstention correctness, latency (avg/p95), cost.

**Gate:** production enablement requires **zero unsupported hard clauses** and **zero cross-tenant retrievals** plus 100% schema validity.

Run: `uv run pytest backend/tests/test_ai_evaluation.py`

## Cadence

- On prompt/model/schema change and monthly: re-run eval sets, record to `aiRuns`/`evaluationCases`.
- Quarterly: human review of abstention and unsupported-claim samples.

## Rate limits & cost

Per-minute: per-user 10, per-org 100, global 1000. Exceeding returns `RATE_LIMITED` with `retry_after_ms=60000`. Tokens tracked as input/output/cached per feature in `aiRuns`; cost estimated without storing prompts (`input $0.001/1k`, `output $0.002/1k`).

## Incident response & rollback

1. Admin disables feature via kill switch.
2. Re-run eval, isolate dataset/model change, revoke model if allowlist violation.
3. Rollback: select prior prompt/model version, re-evaluate gate, re-enable only when gate passes.
4. Audit: `auditEvents` records every toggle with actor and trace.

## Map → Manage

Map risks (hallucination, leakage, injection) → Measure via metrics → Manage via gates, limits, switches, and human approval.
