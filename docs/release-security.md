# BidRadar Release Security Review

Review date: 2026-08-21. Status: **READY_FOR_FINAL_REVIEW**; final security approval remains pending.

## Runtime boundary

- Six concrete GET operations exist: liveness, readiness, opportunity list, assessment, amendment impact, and source proof.
- There is no runtime upload, write, arbitrary URL-fetch, provider-run mutation, authentication bypass, database, shell, or document-processing route.
- Startup loads and verifies one immutable local bundle before readiness. Missing or malformed data fails startup rather than serving partial state.
- Known HTTP, validation, domain, and unexpected errors use UUID envelopes with safe fixed messages. Tests assert no traceback, internal path, configuration, credential, or full-document leakage.
- Frontend responses are validated with closed Zod schemas. React renders excerpts and provider records as escaped text; raw HTML rendering is absent.

## Secret and sensitive-data controls

- Root ignores cover `.env` variants, private keys/certificates, local environments/caches, `backend/data/private-demo/`, and generated preparation inputs while retaining name-only `.env.example` files.
- Runtime receives no provider/model credential. Preparation credentials remain external to source and artifacts.
- `tools/check_sensitive_patterns.py` scans Git-tracked UTF-8 text. Findings retain only a rule name and path; matched text is never stored or printed.
- Secret rules cover AWS-style access IDs, non-empty OpenAI, DeepSeek, and Bright Data token assignments, private-key headers, bearer tokens, and credential-bearing database URLs. Names-only examples remain valid.
- Code-only rules cover unsafe HTML, dynamic evaluation, shell execution, unsafe pickle/YAML loading, and obvious string-built SQL.

## Scanner exclusions

- Excluded: dependency/cache roots, binary assets, exact `frontend/out`, exact private/preparation/generated backend data roots, and lockfiles.
- Not excluded: `backend/data/demo/` public artifacts or authored directories merely named `out`, `generated`, or `build` elsewhere.
- Final scan must run after Task 7 files are tracked so the scanner examines its own implementation and release docs.

## Dependency and code gates

- Python audit command: `(cd backend && uv run pip-audit)`.
- Node audit command: `(cd frontend && pnpm audit --audit-level high)`.
- Static gates: Ruff, ESLint, TypeScript, React tests, Python tests, code-file length, contract checker, sensitive scanner, and `git diff --check`.
- Every authored `.py`, `.ts`, `.tsx`, `.js`, and `.mjs` file must remain below 200 physical lines; every named application function must remain documented.

Fresh results on 2026-08-21:

- pip-audit: no known vulnerabilities; the unpublished local `backend` package was the only skipped item;
- pnpm audit at high severity: no known vulnerabilities;
- tracked sensitive scan: pass across 399 paths in the final integrated tree;
- dangerous runtime routes/patterns: none found;
- Task 7 TDD harness: 8 passed, including fourteen schema mutations, scanner redaction/exclusion behavior, structured payload mutations, and real process-group cleanup;
- Tasks 31-32 added: `frontend/e2e/accessibility|responsive|keyboard|full-bid-lifecycle.spec.ts`, `tools/seed_production_demo.py`, `tools/smoke_platform.py`, `docs/ui-quality-checklist.md`, `docs/demo-script.md`;
- Ruff, ESLint, TypeScript, Python/React tests (667 backend, 307 frontend), production build, line gate, and diff checks: pass.
- Contract checker implementation/mutation tests and committed integrated application gate pass after B alignment `30fa7a0`.
- Deterministic demo: 2 orgs (Alpha 8 opps, Beta 4), 3 companies, 12 opps, 2 amendments (AUTHORITY/ACCEPTED vs BIDDER/REJECTED), proposal `lockedRevision:4`, exports 64hex pinned; `tools/seed_production_demo.py --check` PASS.
- Platform smoke: `tools/smoke_platform.py --mode offline` PASS 0.01s; live probes best-effort, credentials absent, 420s ceiling enforced.

## Process safety

- `tools/smoke_demo.py` uses argument arrays with `shell=False` behavior, quiet child output, fresh loopback ports, short HTTP deadlines, a 420-second total ceiling, and separate process groups.
- A `finally` block terminates frontend and backend groups; SIGTERM escalates to SIGKILL after five seconds.
- Offline mode removes all four scoped credential variables and overwrites both cases of HTTP/HTTPS/ALL proxy variables while permitting localhost through both no-proxy cases. It does not claim a kernel-level network sandbox.

## Residual risks

- Automated collection and retention remain tied to the dated NTPC human review; approval withdrawal requires removing/replacing the proof artifact.
- Official PDF excerpts are bounded public evidence, not permission to mirror documents.
- Accessibility/responsive recheck: 320/768/1024/1440 + 1280/390/320/640 CSS px all report page overflow false; table scrolls internally; keyboard skip/drawer/Space/Esc no-trap PASS; skeletons destination-shaped no spinners; Lighthouse budgets LCP≤2.5 CLS≤0.1 INP≤200 documented.
- Tenant isolation verified for 2 orgs — `frontend/e2e/full-bid-lifecycle.spec.ts` proves Alpha 8 vs Beta 4 rows, `companies.ts`/`opportunities.ts` enforce `organizationId` + Cross-tenant denied, vector retrieval tenant-filtered, worker completions stale-rejected, exports tenant-isolated.
- Previously deferred dependency-policy/backend/frontend visual Minors remain listed in `docs/release-review.md`.
- Two final reviewers and final security approval remain pending; this document does not self-promote the release.
- Revised contract consumption, backend cross-field enforcement, frontend Zod parity, and integrated gates pass. Final security approval is still required.
