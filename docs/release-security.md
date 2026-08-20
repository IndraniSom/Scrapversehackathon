# BidRadar Release Security Review

Review date: 2026-08-20. Status: **application/tool checks passed; controller browser gate pending**.

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
- Secret rules cover AWS-style access IDs, non-empty OpenAI key assignments, private-key headers, bearer tokens, and credential-bearing database URLs.
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

Fresh results on 2026-08-20:

- pip-audit: no known vulnerabilities; the unpublished local `backend` package was the only skipped item;
- pnpm audit at high severity: no known vulnerabilities;
- tracked sensitive scan: pass across 177 paths after Task 7 files were staged;
- dangerous runtime routes/patterns: none found;
- Task 7 TDD harness: 3 passed, including scanner redaction/exclusion behavior and real process-group cleanup;
- Ruff, ESLint, TypeScript, Python/React tests, production build, contract checker, line gate, and diff checks: pass.

## Process safety

- `tools/smoke_demo.py` uses argument arrays with `shell=False` behavior, quiet child output, fresh loopback ports, short HTTP deadlines, a 420-second total ceiling, and separate process groups.
- A `finally` block terminates frontend and backend groups; SIGTERM escalates to SIGKILL after five seconds.
- Offline mode removes the three credential variables and denies proxy-aware outbound HTTP while permitting localhost. It does not claim a kernel-level network sandbox.

## Residual risks

- Automated collection and retention remain tied to the dated NTPC human review; approval withdrawal requires removing/replacing the proof artifact.
- Official PDF excerpts are bounded public evidence, not permission to mirror documents.
- Browser-responsive, keyboard, focus, zoom, and overflow evidence remains pending and blocks READY.
- Previously deferred dependency-policy/backend/frontend visual Minors remain listed in `docs/release-review.md`.
