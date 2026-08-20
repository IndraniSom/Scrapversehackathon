# BidRadar Release Review

Status: **NOT_READY - browser gate pending**

Reviewed: 2026-08-20, Asia/Kolkata. Frozen contract SHA-256: `80d07b05dc8aca107234e349029d144206b8fb8fbea0c88a08a4f4018d8f2566`.

## Skeptical findings recorded before integration fixes

| Severity | Location | Finding and reproduction | Ruling |
|---|---|---|---|
| IMPORTANT | `backend/src/backend/main.py:51` | `app.openapi()` returns frozen bytes, so comparing only that method to the frozen file passes even if concrete FastAPI routes, methods, operation IDs, or response models drift. Reproduce by inspecting `app.openapi` assignment and then mutating a concrete route in an isolated app. | Accepted for Task 7: independently inspect concrete routes and generate framework OpenAPI without the override. Do not edit backend code. |
| IMPORTANT | `tools/check_api_contract.py` | Missing at review start; no standalone release command validates concrete route shape plus representative runtime responses against the frozen contract. Reproduce: required command exits because the file is absent. | Accepted Task 7 tool. |
| IMPORTANT | `tools/smoke_demo.py` | Missing at review start; no bounded two-process, credentials-absent smoke proves startup, all seven product routes, markers, hashes, transition, and cleanup. Reproduce: required command exits because the file is absent. | Accepted Task 7 tool with process-group cleanup on success and failure. |
| IMPORTANT | `tools/check_sensitive_patterns.py` | Missing at review start; no release scanner guarantees path/rule-only secret and dangerous-pattern output. Reproduce: required command exits because the file is absent. | Accepted Task 7 tool; matching values must never be printed. |
| BLOCKING | Controller browser gate | No fresh browser screenshots or interaction measurements exist for 1280px, 390px, 320px, 200% zoom, keyboard order/focus, overflow, 404, or stopped-backend behavior. | Do not fabricate. Controller must complete this gate before release status can become READY. |

## Application review before Task 7 tools

- Authority precedence, recursive amendment topology, stale/untrusted review, UNKNOWN coercion, exact turnover thresholds, legal-entity ownership, project windows, certification renewals, and rejected bidder requests have executable backend regressions.
- Current immutable bundle is OCAC/ODISHA and recomputes `NO_BID` to `BID` with zero applicable UNKNOWN in both versions. Base and amendment hashes are `f1bc41678cd71b0d20cd2432cf579b840af7a52152b72d8c55a5ee129b927afd` and `ccbe30fa4f886087bb09d94cf1073fca97e66789957ba2da63c09a5e7fa657a1`.
- The opportunity inventory has seven rows: 2 CPPP, 2 West Bengal, 2 NTPC, and 1 Odisha. The chosen NTPC proof is a real `RECORDED_BRIGHT_DATA_SNAPSHOT`; the OCAC assessed row and amendment-impact selector remain honest `MANUAL_FIXTURE` values.
- FastAPI error handlers return UUID envelopes with safe messages. No runtime upload, write, arbitrary URL-fetch, docs, or provider mutation route is registered.
- Frontend untrusted data is rendered as React text/JSON text; no `dangerouslySetInnerHTML` is present. Expected transport/schema/not-found failures do not substitute fixtures.
- `UNAVAILABLE_PROVIDER_PROOF_STATE=PASS_COMPONENT_TEST_ONLY`: `frontend/tests/states.test.tsx` proves the safe reason, `MANUAL_FIXTURE`, omitted null provider claims, and native accessible `<details>` disclosure. Browser proof is not implied.
- No accepted B/C application finding is changed by Implementer A. Any later accepted application finding must return to its owner.

## Deferred prior findings

- pnpm maturity exceptions are family-wide.
- Frontend tables/evidence truncate hashes without a stronger accessible full-hash treatment in every surface.
- Repeated uppercase context labels and several state-color semantics remain visual-design Minors.
- Backend retry/poll caps and some test-helper documentation remain deferred Minors.

These deferred findings are not silently reclassified as release passes. Browser evidence remains the only known blocking Task 7 gate before tool execution.

## Task 7 dispositions

| Initial finding | Disposition |
|---|---|
| Frozen `app.openapi` can mask concrete drift | Tool addressed. It never calls `app.openapi`; it compares concrete route/method/operation surface and normalized reachable response-schema graphs. Six required/enum/nullability/closure/envelope/ref mutations fail. The real application now correctly fails this gate. |
| Contract release command absent | Tool addressed, application blocked. Runtime instances/examples still validate, but independently generated success schemas drift from frozen schemas. |
| Two-process smoke absent | Addressed. Normal and offline proxy-denied modes build, start, verify, and terminate both groups in bounded time with credentials absent. |
| Path/rule-only scanner absent | Addressed. Scanner tests prove secret text is absent from formatted output and exact generated/private exclusions do not hide authored paths. Final staged self-scan passes. |
| Controller browser evidence absent | Open and blocking. No browser claim or screenshot was fabricated. |

### Returned application finding

IMPORTANT - `backend/src/backend` generated response schemas: `getLiveness` and `getReadiness` normalize exactly, but `listOpportunities`, `getAssessment`, `getAmendmentImpact`, and `getSourceProof` do not match their frozen reachable response graphs bidirectionally. Reproduction: `(cd backend && uv run python ../tools/check_api_contract.py)` exits nonzero with `operation response schema graph drift`. Observed substantive examples include generated opportunity URL constraints missing frozen HTTPS/URI constraints, assessment rule graph differences including an extra unsupported response branch, and a VERIFIED-only source-proof response model versus the frozen VERIFIED/UNAVAILABLE union. This finding belongs to B; A did not edit application contracts/models.

## Fresh release evidence

| Gate | Result |
|---|---|
| Backend tests | PASS - 401 tests in 4.10 seconds |
| Ruff | PASS |
| pip-audit | PASS - no known vulnerabilities; local unpublished package skipped |
| Frontend tests | PASS - 42 tests across 4 files |
| ESLint / TypeScript | PASS / PASS |
| Next.js production build | PASS - root and two product routes dynamic; not-found static |
| pnpm audit | PASS - no known vulnerabilities at high severity |
| Code-file policy | PASS - zero files at 200+ lines |
| Contract checker TDD mutations | PASS - required, enum, nullability, closure, envelope, and response-ref drift rejected |
| Contract checker real application | **FAIL - four success-operation schema graphs drift** |
| Required/enum mutation probes | PASS - missing authority and unknown source rejected |
| Sensitive scanner | PASS - 177 tracked paths considered, path/rule-only output |
| Provider proof verify-only | PASS - chosen run `j_mt0i928kyu57telkk` |
| Extraction verify-only | PASS - 2 reviewed extractions |
| Normal smoke | PASS - final 4.04 seconds, four credentials absent |
| Offline proxy-denied smoke | PASS - final 3.98 seconds, four credentials absent and both proxy cases overridden |
| Seven-minute automated ceiling | PASS - both rehearsals under 420 seconds |

## Remaining STOP-RELEASE browser gate

Controller must start the integrated application and record actual evidence for:

- `/`, detail, amendment, 404, and stopped-backend failure;
- 1280px, 390px, and 320px widths;
- 200% zoom and no page-level horizontal overflow;
- keyboard-only order, visible focus, native disclosure operation, and 44px primary target size;
- text/icon status differentiation and safe error copy;
- screenshots tied to the tested commit.

Until the B-owned contract drift and every browser item pass, final verdict remains **NOT_READY**. The browser gate is still pending; it is no longer the sole blocker.
