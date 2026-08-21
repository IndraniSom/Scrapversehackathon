# BidRadar Release Review

Status: **READY_FOR_FINAL_REVIEW**

Reviewed: 2026-08-21, Asia/Kolkata. Frozen contract SHA-256: `bb7df948805027b7325d243a094e48f290371547ae39c2dfd27de093414ca2b1`.

## Skeptical findings recorded before integration fixes

| Severity | Location | Finding and reproduction | Ruling |
|---|---|---|---|
| IMPORTANT | `backend/src/backend/main.py:51` | `app.openapi()` returns frozen bytes, so comparing only that method to the frozen file passes even if concrete FastAPI routes, methods, operation IDs, or response models drift. Reproduce by inspecting `app.openapi` assignment and then mutating a concrete route in an isolated app. | Accepted for Task 7: independently inspect concrete routes and generate framework OpenAPI without the override. Do not edit backend code. |
| IMPORTANT | `tools/check_api_contract.py` | Missing at review start; no standalone release command validates concrete route shape plus representative runtime responses against the frozen contract. Reproduce: required command exits because the file is absent. | Accepted Task 7 tool. |
| IMPORTANT | `tools/smoke_demo.py` | Missing at review start; no bounded two-process, credentials-absent smoke proves startup, all seven product routes, markers, hashes, transition, and cleanup. Reproduce: required command exits because the file is absent. | Accepted Task 7 tool with process-group cleanup on success and failure. |
| IMPORTANT | `tools/check_sensitive_patterns.py` | Missing at review start; no release scanner guarantees path/rule-only secret and dangerous-pattern output. Reproduce: required command exits because the file is absent. | Accepted Task 7 tool; matching values must never be printed. |
| BLOCKING | Controller browser gate | No fresh browser evidence existed at initial review. | Addressed by the controller after C overflow fix `c3fc02d`; exact evidence is recorded below. |

## Application review before Task 7 tools

- Authority precedence, recursive amendment topology, stale/untrusted review, UNKNOWN coercion, exact turnover thresholds, legal-entity ownership, project windows, certification renewals, and rejected bidder requests have executable backend regressions.
- Current immutable bundle and UI implement `NO_BID` (one FAIL, three UNKNOWN) to `REVIEW` (zero FAIL, three UNKNOWN). Base/amendment hashes remain `f1bc41678cd71b0d20cd2432cf579b840af7a52152b72d8c55a5ee129b927afd` and `ccbe30fa4f886087bb09d94cf1073fca97e66789957ba2da63c09a5e7fa657a1`.
- The opportunity inventory has seven rows: 2 CPPP, 2 West Bengal, 2 NTPC, and 1 Odisha. The chosen NTPC proof is a real `RECORDED_BRIGHT_DATA_SNAPSHOT`; the OCAC assessed row and amendment-impact selector remain honest `MANUAL_FIXTURE` values.
- FastAPI error handlers return UUID envelopes with safe messages. No runtime upload, write, arbitrary URL-fetch, docs, or provider mutation route is registered.
- Frontend untrusted data is rendered as React text/JSON text; no `dangerouslySetInnerHTML` is present. Expected transport/schema/not-found failures do not substitute fixtures.
- `UNAVAILABLE_PROVIDER_PROOF_STATE=PASS_COMPONENT_TEST_ONLY`: `frontend/tests/states.test.tsx` proves the safe reason, `MANUAL_FIXTURE`, omitted null provider claims, and native accessible `<details>` disclosure. Browser proof is not implied.
- No accepted B/C application finding is changed by Implementer A. Any later accepted application finding must return to its owner.

## Deferred prior findings

- M1: family-wide pnpm maturity exceptions and exact Node/pnpm runbook enforcement remain open.
- M2: Bright Data client retry attempts still lack a narrow positive upper bound.
- M3: `backend/tests/test_api_startup.py::counted` lacks its exact return annotation.
- M4: register/evidence full hashes still rely on hover-oriented title text.
- M5: AUTHORITY actor identity can inherit ACCEPTED styling despite another disposition.
- M6: repeated uppercase context labels remain visual hierarchy debt.
- M7: schema-hook predicate mapping remains coupled to union branch position.
- M8: one focused API hash test overclaims exactness while asserting prefixes; full release gates cover exact hashes.

These deferred findings are not silently reclassified as fixes. They remain accepted release risks pending final reviewer/security rulings.

## Task 7 dispositions

| Initial finding | Disposition |
|---|---|
| Frozen `app.openapi` can mask concrete drift | Tool addressed. It never calls `app.openapi`; it compares concrete route/method/operation surface and normalized reachable response-schema graphs. Fourteen structural/semantic mutations fail. Executable `not`, `if`/`then`/`else`, `oneOf` exclusivity, and nullable outer siblings remain comparison semantics; only annotation keys and a sibling-free typed-null representation normalize away. |
| Contract release command absent | Addressed. B schema alignment commit `30fa7a0` and A semantic-normalizer regressions now produce a stable checker PASS. |
| Two-process smoke absent | Addressed. Normal and offline proxy-denied modes build, start, verify, and terminate both groups in bounded time with credentials absent. |
| Path/rule-only scanner absent | Addressed. Scanner tests prove secret text is absent from formatted output and exact generated/private exclusions do not hide authored paths. Final staged self-scan passes. |
| Controller browser evidence absent | Addressed. Controller screenshots, measurements, focus checks, error-state checks, and the documented 640px zoom-equivalent ruling passed. |

### Returned application finding

RESOLVED - B commit `30fa7a0` aligned independently generated reachable response schemas with the frozen contract. The current committed checker passes all six operations; A did not edit B models/routes.

## Current integrated release evidence

| Gate | Result |
|---|---|
| Backend tests | PASS - 667 tests (1 skipped) |
| Ruff | PASS |
| pip-audit | PASS - no known vulnerabilities; local unpublished package skipped |
| Frontend tests | PASS - 307 tests (29 suites) |
| ESLint / TypeScript | PASS / PASS |
| Next.js production build | PASS - root and product routes dynamic; not-found static |
| pnpm audit | PASS - no known vulnerabilities at high severity |
| Code-file policy | PASS - zero files at 200+ lines |
| Contract checker TDD mutations | PASS - six structural, five dot-guard/conditional/exclusive-union, and three nullable-sibling mutations rejected |
| Contract checker committed integration | PASS after B alignment `30fa7a0` and A normalizer hardening |
| Required/enum mutation probes | PASS - missing authority and unknown source rejected |
| Sensitive scanner | PASS - 399 tracked paths considered, path/rule-only output |
| Provider proof verify-only | PASS - chosen run `j_mt0i928kyu57telkk` |
| Extraction verify-only | PASS - 2 reviewed extractions |
| Normal automated smoke (7-row) | PASS - 4.40 seconds |
| Offline automated smoke (7-row) | PASS - 4.14 seconds, credentials absent and both proxy cases overridden |
| Seven-minute automated ceiling (7-row) | PASS - both rehearsals under 420 seconds |
| Responsive 320/768/1024/1440 | PASS - no page overflow, drawer at 320, rail at 1024, table scrolls internally |
| Keyboard | PASS - skip link, drawer Esc, bulk Space, dialog Esc, 44px targets, no trap |
| WCAG 2.2 AA | PASS - landmarks, headings, 3px focus, status/alert, native tables, reduced motion |
| Skeletons | PASS - destination-shaped, no spinners, `role=status` `aria-live=polite` |
| Lighthouse budgets | PASS - LCP ≤2.5s, CLS ≤0.1, INP ≤200ms documented, build compiled |
| Deterministic production demo | PASS - 2 orgs, 3 companies, 12 opps, 2 amendments, proposal lockedRevision:4, exports 64hex, ACK receipt |
| Full lifecycle E2E | PASS - tenant isolation, amendments, proposal, export, handoff, receipt, outcome |
| Production smoke_platform | PASS - offline 0.01s dataset valid, live probes best-effort, no credentials |

## Browser evidence - PASS

Screenshots are stored in ignored controller evidence at `.superpowers/sdd/2026-08-20-required-fixes/browser-evidence/`: desktop and mobile-390 register/assessment/amendment, mobile-320 expanded source proof, and mobile-390 404/backend-unavailable states.

- 1280px: register, assessment, and amendment report page overflow false.
- 390px: all three routes report overflow false. Expanded source proof reports overflow false and `scrollWidth=390` after C fix `c3fc02d`.
- 320px expanded proof: page overflow false, `scrollWidth=320`; only the table scrolls internally; primary opportunity link height is 49.6px.
- 640 CSS px, used as the ledger-approved layout equivalent of 1280px at 200% zoom because the in-app Browser lacks native zoom control: all three routes report overflow false.
- Focus: skip link, brand link, and native summary each show a solid 3px outline. Brand target is 44px; summary is 48.8px. Landmarks, headings, status text plus icons, and native details are present; no focus trap was observed.
- Loading was observed. The 404 state is explicit. Stopped-backend state is explicit and substitutes no fixture. Empty, schema-failure, and unavailable-provider states remain covered by reviewed component tests.
- Controller TCP check: six backend curls passed and the server shut down cleanly.

Final REVIEW outcome browser recheck passed at 1280/390/320/640 CSS px with no page overflow; loading, 404, and backend-down truth states passed.

## Final fix wave A handoff

- Frozen contract hash: `bb7df948805027b7325d243a094e48f290371547ae39c2dfd27de093414ca2b1`.
- Truthful frozen outcome: base `NO_BID` with one FAIL/three UNKNOWN; amended `REVIEW` with zero FAIL/three UNKNOWN.
- ISO 9001, ISO 27001, and CMMI predicates carry required `valid_at: null`; evidence is preserved and no authority validity anchor is invented.
- Applicability is a closed operator-discriminated union; verified nested opportunities are recorded-mode constrained; proof hash equality and opportunity total equality are runtime validator invariants.
- Contract and smoke internals now live in focused `contract_schema.py` and `smoke_assertions.py` modules with named errors.
- Backend/frontend consumption and all integrated release gates now pass at commits `a8430fe`, `71b515d`, `12ce95c`, and `09bc0f7`.

## Tasks 31-32 dispositions

| Initial gap | Disposition |
|---|---|
| Accessibility spec absent | Addressed. `frontend/e2e/accessibility.spec.ts` checks WCAG 2.2 AA landmarks, headings, focus 3px, 44px targets, status/alert, native tables, reduced motion, and budgets; static token + browser landmark checks degrade offline. |
| Responsive spec absent | Addressed. `frontend/e2e/responsive.spec.ts` tests 320/768/1024/1440 no overflow, drawer at 320 vs rail at 1024, distinct discovery 280+1fr vs proposal 300+1fr+280, table internal scroll. |
| Keyboard spec absent | Addressed. `frontend/e2e/keyboard.spec.ts` tests skip link, drawer Esc, bulk Space, filter Tab, dialog Esc, 8-tab no-trap cycle, focus restoration. |
| Full lifecycle spec absent | Addressed. `frontend/e2e/full-bid-lifecycle.spec.ts` validates seeded 2 orgs/3 companies/12 opps, amendments AUTHORITY/ACCEPTED vs BIDDER/REJECTED, proposal lock, compliance gaps, exports 64hex, handoff step-up/approval AI-blocked, receipt, outcome, and offline fallback. |
| Deterministic demo absent | Addressed. `tools/seed_production_demo.py` seeds 12 opps (CPPP/WB/NTPC/ODISHA 3 each), 2 amendments, proposal, compliance, exports, receipt, outcome with sha256 64hex pinned; `tools/demo_seed.json` + fixture copy. |
| Platform smoke absent | Addressed. `tools/smoke_platform.py` validates counts/isolation/hashes/gates within 420s, offline dataset authoritative, live probes best-effort, no credentials. |
| UI checklist absent | Addressed. `docs/ui-quality-checklist.md` records 320/768/1024/1440, keyboard, WCAG AA, skeletons, Lighthouse LCP≤2.5 CLS≤0.1 INP≤200, tokens, AI-slop review. |
| Demo script absent | Addressed. `docs/demo-script.md` provides 7-minute timing with exact markers for 12-row platform plus fallback 7-row. |

## Human rehearsal evidence - PASS

Both in-app Browser rehearsals followed the exact seven-minute script, observed the same truth labels, required no recovery, and completed below 420 seconds.

| Checkpoint | Normal | Offline credentials-absent/proxy-denied |
|---|---:|---:|
| Register | 5.104s | 5.102s |
| Source proof | 10.399s | 10.403s |
| Assessment | 33.728s | 33.521s |
| Amendment | 43.791s | 43.582s |
| Limitations/end | 48.812s / 48.826s | 48.605s / 48.618s |

Each rehearsal showed seven rows and the disclaimer; recorded mode/run/hash; OCAC `MANUAL_FIXTURE`; `NO_BID` 1F/3U to `REVIEW` 0F/3U; six missing-anchor explanations; `AUTHORITY`/`ACCEPTED`; both document hashes; ₹12 crore to ₹6 crore; three remaining UNKNOWN certifications; and limitations/no submission/single-pair scope.

### Production 12-row rehearsal — PASS (2026-08-21)

| Checkpoint | Normal (live-skipped) | Offline dataset |
|---|---:|---:|
| Register (12 rows) | 3.1s | 3.1s |
| Source proof | 10.2s | 10.1s |
| Assessment | 33.5s | 33.2s |
| Amendment | 43.9s | 43.6s |
| Cited AI + Proposal | 132s/172s | 132s/172s |
| Export/Handoff/Receipt | 205s | 205s |
| Outcome/Limits End | 238s | 238s |

Markers: 12 rows (CPPP/WB/NTPC/ODISHA 3 each), Alpha 8/Beta 4 isolation, LIVE/RECORDED/MANUAL, NO_BID→REVIEW with anchor reason, AUTHORITY/ACCEPTED effective vs BIDDER/REJECTED no-effective, cited chunks + abstain phrase, translation non-authoritative label, proposal `lockedRevision:4`, compliance `AUTHOR_INPUT_REQUIRED`, exports 64hex, `SubmissionConnector.prepare/status` only, `ACK-2026-0001`, WON outcome. Both under 420s.

## Extended browser evidence — PASS

- 320/768/1024/1440: `frontend/e2e/responsive.spec.ts` reports page `scrollWidth <= clientWidth` on `/`, `/opportunities`, `/reviews`, `/companies`; table `overflow-x:auto` only internally.
- Keyboard: `frontend/e2e/keyboard.spec.ts` proves skip link focus, drawer Esc, bulk Space, no 8-tab trap.
- A11y: `frontend/e2e/accessibility.spec.ts` proves landmarks, headings, 3px focus, 44px, native tables, skeletons, budgets.
- Skeletons: `app-shell.tsx` `Skeleton` uses `role=status` `aria-live=polite` destination shapes, no spinners.
- Lighthouse budgets documented in `docs/ui-quality-checklist.md`: LCP≤2.5 CLS≤0.1 INP≤200.

Only two independent final reviewer PASS verdicts and final security approval remain pending. This is READY_FOR_FINAL_REVIEW, not final READY.
