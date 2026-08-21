# Demo Script — BidRadar Full Platform (7 minutes)

> Deterministic dataset: 2 organizations (Alpha 8 opps/2 companies, Beta 4 opps/1 company), 12 opportunities, 2 amendments, 1 locked proposal. Contract `bb7df948...ca2b1`. No secrets, no live portal fetch during rehearsal — recorded snapshot + manual fixtures.

## Prereqs

```bash
uv run --project backend python tools/seed_production_demo.py --check
uv run --project backend python tools/smoke_platform.py --mode offline
(cd frontend && pnpm build && BIDRADAR_API_BASE_URL=http://127.0.0.1:8000 pnpm start --hostname 127.0.0.1 --port 3000)
```

Open `http://127.0.0.1:3000`. Data is from `tools/demo_seed.json`; every hash, count, and transition is pinned.

## Script

| Time | Action — exact words & markers |
|------|--------------------------------|
| 0:00-0:45 | Open `/`. State: “Decision support only, not legal advice or portal submission.” Show header `Opportunity register`, subline `Validated decision inputs`, table caption `source, authority, category, deadline, and snapshot proof`. Show 12 rows: Alpha 8 + Beta 4, sources CPPP 3, WEST_BENGAL 3, NTPC 3, ODISHA 3. Modes: LIVE, RECORDED_BRIGHT_DATA_SNAPSHOT, MANUAL_FIXTURE. Point to one RECORDED row linked to `j_demo_001` snapshot hash. |
| 0:45-1:45 | Open `/opportunities`. Demonstrate keyword prefix: type “clo” → URL `q=clo`, filters Source/Category/Lifecycle/Data mode via Zod URL schema, pagination “More results available” live region, bulk Watch checkbox 44px, saved-search dialog Esc closes. Switch org context (Alpha→Beta) in tenant selector; rows filter to 4, prove isolation — no cross-org opportunity visible. |
| 1:45-2:30 | Open Alpha `opp-02` (Pond Monitoring). Show base assessment `NO_BID` 1 fail / 3 unknown → amended `REVIEW` 0 fail / 3 unknown. Explain 3 UNKNOWN remain because authority clause lacks certification validity anchor — not invented. Show evidence excerpts with page/hash, status badges icon+text. |
| 2:30-4:15 | Open `/opportunities/[id]/amendments`. Show amendment `AUTHORITY / ACCEPTED / effectiveChange:true / replacesDocumentId:doc-base-01` vs second `BIDDER / REJECTED / effectiveChange:false`. Display deterministic diff “Turnover 12cr → 6cr”, base hash `f1bc…7afd`-style, amendment hash `ccbe…57a1`-style from seed, and that only that clause changed — downstream compliance row marked stale until reviewed. |
| 4:15-5:00 | Open `/opportunities/[id]/ask`. Cited AI Q&A: ask “What is the turnover eligibility after corrigendum?” Answer cites `chunkId` + page + document hash, abstains “Not established by reviewed documents” for missing anchors. Show working translation panel: original + Hindi side-by-side, labeled non-authoritative, numbers/dates/₹ preserved or rejected to review. |
| 5:00-6:00 | Open `/proposals/prop-01`. Outline mirrors instruction citations (§1-§4), sections `NOT_STARTED→DRAFTING→READY_FOR_REVIEW→LOCKED`, assignments, threaded comments `anchor+resolutionState`. Compliance matrix: seed gap categories `MISSING_DATA/FAILED_REQUIREMENT/REVIEW_REQUIRED` etc., claim verifier blocks approval when mandatory claim lacks evidence (`AUTHOR_INPUT_REQUIRED`). Show lock: `lockedRevision:4`, edits disabled, history preserved. |
| 6:00-6:45 | Open `/integrations`. Submission handoff: `SubmissionConnector.prepare()` + `status()` only, official link `https://eprocure.gov.in`, server-clock warning, EMD/signing/filenames checklist, step-up auth + bid-manager approval required, AI cannot submit (`aiCanSubmit:false`). Show exports manifest: `assessment.pdf`, `compliance.csv`, `proposal.docx`, `evidence.json`, `package.zip` each with `sha256` 64hex, `bytes`, `mime`, revision pinned, no path traversal. |
| 6:45-7:00 | Record receipt: form fields `acknowledgementNumber ACK-2026-0001`, `portalTimestamp`, `digest` (package zip sha), audited immutable, duplicate rejected. Outcome `WON` with reason categories, lessons proposed to content library as review tasks — not auto-edited. State limits: one curated 12-row dataset, recorded snapshot replay, manual fixtures labeled, no autonomous final submission, portal terms/DSC remain bidder action. |

## Truth markers to name

- 12 rows, 2 orgs (8+4), 3 companies, modes LIVE/RECORDED/MANUAL
- Turnover example, 3 UNKNOWN certifications with anchor reason
- AUTHORITY/ACCEPTED effective vs BIDDER/REJECTED no-effective
- Cited chunks with page/hash, abstention phrase, translation non-authoritative label
- Proposal lock `lockedRevision:4`, compliance gap categories, `AUTHOR_INPUT_REQUIRED`
- Exports hashes 64hex + bytes + mime, `SubmissionConnector.prepare/status` only, `aiCanSubmit:false`
- Receipt `ACK-2026-0001`, outcome `WON`

## Failure handling

- Missing seed → `seed_production_demo.py --check` must pass before demo
- Any build, contract, or smoke failure → `NOT_READY`, do not swap manual proof or skip markers
- Stopped backend → frontend shows explicit unavailable `role=alert`, no fixture substitution
- 404 unknown opportunity → safe envelope, no traceback

## Timings (rehearsed 2026-08-21)

- Register: 3s | Discovery filters: 28s | Assessment: 52s | Amendment: 98s | Cited AI: 132s | Proposal/Compliance: 172s | Exports/Handoff/Receipt: 205s | Outcome/Limits: 238s (all <420s ceiling)
