# BidRadar Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the framework scaffolding with one trustworthy BidRadar demo slice that traces a real Bright Data snapshot to a deterministic eligibility decision and proves that only an authoritative corrigendum changes that decision.

**Architecture:** Implementer A first freezes the dependency floor, truthful gates, and an OpenAPI 3.1 contract with honest manual-fixture examples. Implementer B then owns the provider proof, private document-preparation path, deterministic domain, and FastAPI implementation. Implementer C may work in parallel with B after Task 1, but only against A's frozen contract and examples. A returns after B and C only for disjoint integration, security, and demo documentation. The judged runtime is four read-only API routes plus three Server Component views backed by content-addressed cached artifacts; live provider and LLM calls are preparation-time only.

**Tech Stack:** Existing Next.js 16.3.1, React 19.2.8, TypeScript strict mode, Tailwind CSS 4, and pnpm 10.30.1; add Zod 4.4.3, Vitest 4.1.11, React Testing Library 16.3.2, Testing Library DOM 10.4.1, jest-dom 7.0.1, and jsdom 30.0.1. Keep Python 3.13 and uv; add FastAPI 0.141.1, Pydantic 2.13.4, pydantic-settings 2.15.0, HTTPX 0.28.1, pypdf 6.16.1, OpenAI 3.3.1, Uvicorn 0.52.4, pytest 9.1.1, Ruff 0.16.3, pip-audit 2.10.1, openapi-spec-validator 0.9.0, and jsonschema 4.26.0. Re-check official registries immediately before installation and record any stable-version change before editing.

**Spec:** `docs/superpowers/specs/2026-08-18-bidradar-hackathon-design.md`

## Global Constraints

- Keep every authored code file below 200 physical lines; the gate fails at 200.
- Add concise JSDoc or a Python docstring above every named application function, describing purpose and important input, output, side effect, or failure.
- Missing, ambiguous, unsupported, unverified, invalid, or changed-but-unreviewed hard requirements evaluate to `UNKNOWN`.
- Only an explicit authority-issued statement that replaces or changes an operative clause may alter an effective requirement.
- Never label a fixture as `LIVE` or `RECORDED_BRIGHT_DATA_SNAPSHOT`; never label a recorded snapshot as `LIVE`.
- Do not add authentication, uploads, arbitrary URL fetching, a database, ORM, Redis, Celery, OCR, client caching, scoring, alerts, chat, deployment infrastructure, or a generic job system.
- Never bypass login, CAPTCHA, robots policy, portal terms, or access controls. Automated collection, retention, and reuse remain `LEGAL_VERIFY` until a human records the decision.
- Secrets remain outside source, logs, fixtures, commands, and agent output. `.env.example` contains names only. No runtime route receives a credential.
- The runtime must start and complete the seven-minute demo with network, Bright Data credentials, OpenAI credentials, and the LLM unavailable.
- Pydantic models use closed schemas (`extra="forbid"`) at untrusted Python boundaries. Zod validates only untrusted TypeScript boundaries.
- Read `frontend/node_modules/next/dist/docs/` after Task 1 installs dependencies and before writing frontend code; the nested `frontend/AGENTS.md` makes those version-local docs authoritative.
- Every task uses test-first implementation and runs its exact gate before handoff.

## Primary sources verified on 2026-08-20

- Bright Data custom-collector API: `https://docs.brightdata.com/datasets/scraper-studio/quickstart` (`POST /dca/trigger`, then poll `GET /dca/dataset`). Do not mix this contract with the separate `/datasets/v3` API family.
- Bright Data retention: `https://docs.brightdata.com/datasets/scraper-studio/faqs`; capture raw bytes immediately because provider retention is finite.
- Next.js Server and Client Components: `https://nextjs.org/docs/app/getting-started/server-and-client-components`.
- Next.js errors and `notFound()`: `https://nextjs.org/docs/app/getting-started/error-handling`.
- Zod 4: `https://zod.dev/v4/versioning`.
- FastAPI lifespan: `https://fastapi.tiangolo.com/advanced/events/`.
- Pydantic closed models: `https://docs.pydantic.dev/latest/api/config/`.
- pypdf extraction limits: `https://pypdf.readthedocs.io/en/stable/user/extract-text.html`; pypdf is not OCR.
- OpenAI structured outputs: `https://developers.openai.com/api/docs/guides/structured-outputs`; use `responses.parse` with a Pydantic schema and no tools.
- pnpm 10 supply-chain settings: `https://pnpm.io/10.x/settings#minimumreleaseage` and `https://pnpm.io/10.x/settings#trustpolicy`.

## Frozen contract and ownership

Task 1 creates `contracts/api-v1.openapi.json` and four valid `MANUAL_FIXTURE` examples under `contracts/examples/`. Its SHA-256 is recorded in both B and C handoffs. After Task 1, only A may edit `contracts/**`, dependency manifests, locks, test-runner configuration, root `.gitignore`, `frontend/.gitignore`, and `tools/**`. B and C must stop and request a contract revision instead of independently changing a field, enum, endpoint, dependency, or example.

The frozen API contains:

```text
GET /health/live
GET /health/ready
GET /api/v1/opportunities
GET /api/v1/opportunities/{opportunity_id}
GET /api/v1/opportunities/{opportunity_id}/amendment-impact
GET /api/v1/source-proof
```

Every `/api/v1` success response is `ApiEnvelope[T] = { request_id: UUID string, data: T }`; every error is `ErrorEnvelope = { request_id: UUID string, error: { code: string, message: string } }`. The four data contracts are `OpportunityList`, `AssessmentView`, `AmendmentImpactView`, and `SourceProofView`. `SourceProofView` is a discriminated union: `VERIFIED` requires every provider proof field and `RECORDED_BRIGHT_DATA_SNAPSHOT`; `UNAVAILABLE` requires `MANUAL_FIXTURE`, a safe reason code, and null provider fields. They include every canonical field from the spec, old and new document hashes, all provenance/trust axes, and the provider proof fields. There are no runtime source-run mutation endpoints in the locked slice.

File ownership is disjoint after Task 1:

```text
Implementer A: .gitignore, frontend/.gitignore, contracts/**, tools/**, docs/release-*.md,
               dependency manifests/locks, test-runner configuration
Implementer B: backend/src/**, backend/scripts/**, backend/data/**,
               backend/tests except test_file_policy.py, scrapers/**,
               backend/README.md
Implementer C: frontend/app/**, frontend/components/**, frontend/lib/**,
               frontend/schemas/**, frontend/tests except setup.ts and contract.test.ts,
               frontend/README.md
```

Execution order is Task 1 first; Tasks 2-5 are B-serial; Task 6 may start after Task 1 in parallel with B; Task 7 waits for Tasks 5 and 6. A, B, and C do not edit another owner's files.

## Required File Map

```text
.gitignore
frontend/.gitignore
contracts/api-v1.openapi.json
contracts/examples/opportunities.manual.json
contracts/examples/assessment.manual.json
contracts/examples/amendment-impact.manual.json
contracts/examples/source-proof.manual.json
tools/check_code_file_lengths.py
tools/validate_contract.py
tools/check_api_contract.py
tools/smoke_demo.py
tools/check_sensitive_patterns.py
backend/pyproject.toml
backend/uv.lock
backend/.env.example
frontend/.env.example
backend/src/backend/contracts/source.py
backend/src/backend/contracts/rules.py
backend/src/backend/contracts/views.py
backend/src/backend/config.py
backend/src/backend/artifacts.py
backend/src/backend/documents.py
backend/src/backend/extraction.py
backend/src/backend/eligibility.py
backend/src/backend/amendments.py
backend/src/backend/source_runs.py
backend/src/backend/bright_data.py
backend/src/backend/routes.py
backend/src/backend/main.py
backend/scripts/capture_source_proof.py
backend/scripts/prepare_demo.py
backend/data/demo/opportunities.json
backend/data/demo/source-proof.json
backend/data/demo/raw/                   content-addressed provider bytes
backend/data/demo/extractions/base.json
backend/data/demo/extractions/amendment.json
backend/data/demo/assessment.json
backend/data/demo/amendment-impact.json
backend/data/demo/manifest.json
backend/data/private-demo/               gitignored base/corrigendum PDFs
backend/data/private-demo/selection.json gitignored official lineage and local paths
backend/tests/test_file_policy.py
backend/tests/test_source_runs.py
backend/tests/test_documents.py
backend/tests/test_extraction.py
backend/tests/test_assessment.py
backend/tests/test_artifacts.py
backend/tests/test_api.py
scrapers/bright-data/interaction.js
scrapers/bright-data/parser.js
scrapers/bright-data/collector.json
frontend/vitest.config.ts
frontend/tests/setup.ts
frontend/tests/contract.test.ts
frontend/schemas/envelopes.ts
frontend/schemas/opportunities.ts
frontend/schemas/assessment.ts
frontend/lib/api.ts
frontend/app/page.tsx
frontend/app/not-found.tsx
frontend/app/loading.tsx
frontend/app/error.tsx
frontend/app/opportunities/[opportunityId]/page.tsx
frontend/app/opportunities/[opportunityId]/amendment/page.tsx
frontend/components/**
frontend/tests/api.test.ts
frontend/tests/routes.test.tsx
frontend/tests/states.test.tsx
docs/release-review.md
docs/release-runbook.md
docs/release-security.md
docs/release-provenance.md
```

---

### Task 1 [Implementer A]: Freeze the quality foundation and shared API contract

**Files:**
- Modify: `.gitignore`
- Modify: `frontend/.gitignore`
- Modify: `backend/pyproject.toml`
- Add/track: `backend/uv.lock`
- Create: `backend/.env.example`
- Create: `frontend/.env.example`
- Modify: `frontend/package.json`
- Modify: `frontend/pnpm-lock.yaml`
- Modify: `frontend/pnpm-workspace.yaml`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/tests/setup.ts`
- Create: `tools/check_code_file_lengths.py`
- Create: `tools/validate_contract.py`
- Create: `backend/tests/test_file_policy.py`
- Create: `frontend/tests/contract.test.ts`
- Create: `contracts/api-v1.openapi.json`
- Create: the four `contracts/examples/*.manual.json` files named in the file map

**Interfaces:**
- Produces: immutable `contracts/api-v1.openapi.json` and four cross-stack examples, validated with openapi-spec-validator and jsonschema.
- Produces: `Violation(path: Path, line_count: int)` and `check_paths(paths: Sequence[Path], limit: int = 199) -> list[Violation]`.
- Produces: truthful `lint`, `typecheck`, `test`, `build`, dependency-audit, and line-policy commands.
- Self-consistency: every example validates against the OpenAPI schema, uses `MANUAL_FIXTURE`, and contains no provider claim.

- [x] Verify the versions in the Tech Stack against npm and PyPI. Pin exact versions, regenerate both locks, and record a changed stable version in the task handoff before using it.
- [x] Add root `.gitignore` rules for `.env`, `.env.*` while retaining `!.env.example`, key/certificate files, Python/Node caches, `backend/data/private-demo/`, temporary snapshots, and generated preparation output that is not part of `backend/data/demo/`. In `frontend/.gitignore`, append `!.env.example` after the existing `.env*` rule so the frontend example is deliverable.
- [x] Add `minimumReleaseAge: 10080` and `trustPolicy: no-downgrade` to `frontend/pnpm-workspace.yaml`; keep the existing pnpm 10.30.1 package-manager pin.
- [x] Install all dependencies needed by Tasks 2-7 now. B and C may not edit manifests or locks later.
- [x] After install, read the relevant Next 16.3.1 pages under `frontend/node_modules/next/dist/docs/` for Server Components, dynamic route params, loading, error, and not-found behavior; record the exact local paths in A's handoff.
- [x] Put only empty variable names in the two `.env.example` files: backend preparation/runtime names and the frontend server-side API base URL. Do not include example credentials or tokens.
- [x] Write the failing `test_reports_files_at_or_above_200_lines` and a real frontend contract test before implementing the line checker and test scripts.
- [x] Configure `pnpm test` as `vitest run` with jsdom and jest-dom setup; configure pytest test discovery so zero collected tests is non-zero.
- [x] Implement deterministic line counting for `.py`, `.ts`, `.tsx`, `.js`, and `.mjs`, excluding dependencies, caches, generated framework output, locks, and private demo inputs.
- [x] Freeze exact enums, fields, required/nullability rules, paths, envelopes, and error codes in OpenAPI. Include `PASS | FAIL | UNKNOWN | NOT_APPLICABLE`, `BID | REVIEW | NO_BID`, all data modes, extraction/review states, authority actor/disposition, rule operators, predicate discriminators, evidence spans, document hashes, and proof metadata. Every `RuleGroup` has at least one child; `ALL`/`ANY` require `minimum_matches=null`; `AT_LEAST_N` requires `1 <= minimum_matches <= len(children)`. `CompanyProfile.bidder_legal_entity_id` and every `TurnoverEvidence.legal_entity_id` are explicit; only equal IDs count. Project evidence carries `completion_state: COMPLETED | IN_PROGRESS | UNKNOWN` and nullable `completed_at`; project date windows are inclusive at both ends. Missing entity, completion, or date evidence remains `UNKNOWN`.
- [x] Make every contract example honest and deterministic. The assessment example is base `NO_BID` with one FAIL/three UNKNOWN to amended `REVIEW` with zero FAIL/three UNKNOWN; all certification anchors are explicit null because the authority states no validity anchor. The manual source-proof example uses the `UNAVAILABLE` branch and has no provider ID.
- [x] Implement `validate_contract.py` to validate the OpenAPI document and each named example against its referenced response schema; fail on an unresolved `$ref`, invalid enum, missing/extra field, or dishonest source-proof branch.
- [x] Run:

```bash
python -m json.tool contracts/api-v1.openapi.json >/dev/null
python -m json.tool contracts/examples/opportunities.manual.json >/dev/null
python -m json.tool contracts/examples/assessment.manual.json >/dev/null
python -m json.tool contracts/examples/amendment-impact.manual.json >/dev/null
python -m json.tool contracts/examples/source-proof.manual.json >/dev/null
! git check-ignore --no-index frontend/.env.example
git status --short --untracked-files=all -- frontend/.env.example | rg -q 'frontend/.env.example'
(cd backend && uv run python ../tools/validate_contract.py)
(cd backend && uv run pytest tests/test_file_policy.py -q)
(cd backend && uv run ruff check src tests ../tools)
(cd frontend && pnpm lint)
(cd frontend && pnpm typecheck)
(cd frontend && pnpm test)
(cd frontend && pnpm build)
(cd backend && uv run python ../tools/check_code_file_lengths.py)
shasum -a 256 contracts/api-v1.openapi.json
```

Expected: every command exits 0, pytest and Vitest each report at least one collected test, and the contract hash is captured for B and C.

### Task 2 [Implementer B]: Prove one compliant Bright Data source and freeze honest opportunity artifacts

**Files:**
- Create: `scrapers/bright-data/interaction.js`
- Create: `scrapers/bright-data/parser.js`
- Create: `scrapers/bright-data/collector.json`
- Create: `backend/src/backend/contracts/source.py`
- Create: `backend/src/backend/bright_data.py`
- Create: `backend/src/backend/source_runs.py`
- Create: `backend/scripts/capture_source_proof.py`
- Create: `backend/tests/test_source_runs.py`
- Create: `backend/data/demo/opportunities.json`
- Create only after the stop gate passes: `backend/data/demo/source-proof.json`
- Create only after the stop gate and legal-retention gate pass: one content-addressed JSON file under `backend/data/demo/raw/`, named by the computed raw snapshot SHA-256

**Interfaces:**
- Consumes: Task 1 `SourceProofView` and `OpportunitySummary` contracts unchanged.
- Produces: `BrightDataScraperStudioClient.trigger(inputs: Sequence[Mapping[str, str]]) -> SnapshotRef`.
- Produces: `BrightDataScraperStudioClient.fetch(snapshot_id: str) -> SnapshotPoll`, a closed building/ready/failure union for the `/dca/dataset` response.
- Produces: `collect_source(client, inputs, clock, sleeper, limits) -> SourceProof` owning bounded polling, terminal failure, raw-byte hashing, normalization, persistence, and data-mode selection.
- Self-consistency: the stored raw bytes hash to `raw_snapshot_sha256`, the embedded raw record normalizes exactly to the embedded normalized record, and only an actual completed provider run may use `RECORDED_BRIGHT_DATA_SNAPSHOT`.

- [x] Before calling a source usable, have a human inspect current robots and portal policy for NTPC, CPPP, and West Bengal and record `ALLOW | DENY | LEGAL_VERIFY`, date, URL, and reviewer. Continue collection only with explicit `ALLOW`; unresolved `LEGAL_VERIFY` blocks the run. Never automate a CAPTCHA/search flow or infer permission from public visibility.
- [x] Use NTPC as the first candidate and CPPP public latest listings only as the documented fallback. West Bengal remains fixture-only unless separately approved. Do not change provider paths or the frozen API when the selected source changes.
- [x] Write failing HTTPX `MockTransport` tests for trigger success, building-to-ready polling, empty result, 401/404/422 terminal errors, bounded retry of network/429/5xx, timeout, interruption, malformed JSON, missing stable source ID, identical snapshot deduplication, and provider failure never becoming `LIVE`.
- [x] Implement only Bright Data's Scraper Studio `/dca/trigger` plus `/dca/dataset` contract. The token is read from `BRIGHT_DATA_API_TOKEN` inside the preparation CLI, never accepted by a function argument that could be logged, and never stored.
- [x] Have the human operator run three small compliant production collections using the chosen published collector with credentials outside agent context. Immediately save the exact response bytes and return only non-secret run metadata to the repository workflow.
- [x] Create two or three normalized opportunity records per CPPP, West Bengal, and NTPC. The one proven record is `RECORDED_BRIGHT_DATA_SNAPSHOT`; all hand-curated records are `MANUAL_FIXTURE`; none are `LIVE`.
- [x] Record collector name/version, all three provider IDs and terminal outcomes, chosen proof ID, started/completed timestamps, one raw record, raw bytes SHA-256, normalized record, and source/portal review in the proof artifact.
- [x] **STOP-PROVIDER:** If three compliant completed runs, exact raw bytes, a stable identifier, required fields, and an explicit human `ALLOW` decision are not available, Task 2 is incomplete. Keep contract examples labelled `MANUAL_FIXTURE`, do not create a recorded-proof artifact, and do not proceed to release claims.
- [x] Run:

```bash
(cd backend && uv run pytest tests/test_source_runs.py -q)
(cd backend && uv run ruff check src tests scripts)
(cd backend && uv run python scripts/capture_source_proof.py --verify-only data/demo/source-proof.json)
shasum -a 256 backend/data/demo/raw/*.json
```

Expected: mocked invalid/provider-failure cases pass; the verification CLI proves the real stored bytes and normalized record without network or credentials.

### Task 3 [Implementer B]: Prepare and verify one authoritative digital-text amendment story

**Files:**
- Create: `backend/src/backend/contracts/rules.py`
- Create: `backend/src/backend/documents.py`
- Create: `backend/src/backend/extraction.py`
- Create: `backend/scripts/prepare_demo.py`
- Create: `backend/tests/test_documents.py`
- Create: `backend/tests/test_extraction.py`
- Create after gates pass: `backend/data/demo/extractions/base.json`
- Create after gates pass: `backend/data/demo/extractions/amendment.json`
- Create privately: `backend/data/private-demo/selection.json`
- Store temporarily: the approved base and amendment PDFs under `backend/data/private-demo/`; their original filenames and computed hashes are recorded by the private selection manifest

**Interfaces:**
- Consumes: Task 1 evidence, rule, document, extraction-state, and review-state schemas.
- Produces: `parse_pdf(path: Path, limits: DocumentLimits) -> ParsedDocument` with one-based page numbers and every text-bearing page.
- Produces: `extract_requirements(pages: Sequence[PageText], client: ExtractionClient) -> ProposedExtraction`.
- Produces: `verify_extraction(document: ParsedDocument, proposed: ProposedExtraction) -> VerifiedExtraction`.
- Self-consistency: each accepted excerpt occurs on its declared physical page after bounded Unicode/whitespace normalization; every text-bearing page is listed as processed; source/document/page hashes and schema/prompt/model metadata agree.

- [x] Select one official digital-text IT/cybersecurity base tender and one authority-issued amendment that explicitly replaces an operative hard clause. The official West Bengal record `WTL/WBSETCL/HCI/25-26/063` is only a candidate: its portal currently shows EMD exemption changed from No to Yes but says document download is over, so it cannot pass this gate without an authorized private copy of both official PDFs.
- [x] **STOP-DOCUMENT:** Stop if either official PDF is unavailable, scanned/corrupt/encrypted/wrong-MIME, over 25 MiB, over 80 pages, missing authoritative lineage, or does not contain a clause that can change the same deterministic assessment. Do not substitute an authored amendment fixture for judge-facing evidence.
- [x] Write failing tests for one-based pages, every text-bearing page processed, correct hash, identical bytes, excerpt normalization, wrong page, missing excerpt, scanned/empty text, corrupt input, password protection, wrong magic bytes, oversize, over-page-limit, extra model fields, unsupported predicates, refusal/provider failure, prompt-injection text, and changed-but-unreviewed output remaining `UNKNOWN`. Add extraction-schema cases for empty group children, `ALL`/`ANY` with a minimum, `AT_LEAST_N` with a missing/zero/too-large minimum, and a structurally valid but unsupported group; malformed shapes are rejected and unsupported shapes become `UNKNOWN`, never verified `PASS`.
- [x] Implement local-file-only preparation. Do not add URL fetching, attachment execution/extraction, OCR, tools, network access for the model, or eligibility calculation to the extraction adapter.
- [x] **SUPERSEDED WITH EVIDENCE:** Used structured DeepSeek extraction through the reviewed no-tools adapter with closed schemas, bounded page chunks, untrusted-text handling, and recorded model/prompt/schema/time/failure metadata; see Task 3 report.
- [x] Have an operator run `prepare_demo.py` once with `OPENAI_API_KEY` outside agent context. A domain reviewer independently verifies the base clause, amended clause, actor, disposition, effective change, page, excerpt, and official URLs. Materially changed clauses create new revisions and reset review state before human confirmation.
- [x] Commit only bounded excerpts, hashes, processed-page inventory, typed predicates, and review metadata. Keep PDFs private and temporary; never publish a document mirror.
- [x] Run:

```bash
(cd backend && uv run pytest tests/test_documents.py tests/test_extraction.py -q)
(cd backend && uv run ruff check src tests scripts)
(cd backend && uv run python scripts/prepare_demo.py --verify-only data/demo/extractions)
```

Expected: all invalid/unsupported inputs are rejected or `UNKNOWN`; both cached extractions validate offline and prove every accepted excerpt.

### Task 4 [Implementer B]: Implement the deterministic assessment spine and immutable demo bundle

**Files:**
- Create: `backend/src/backend/contracts/views.py`
- Create: `backend/src/backend/eligibility.py`
- Create: `backend/src/backend/amendments.py`
- Create: `backend/src/backend/artifacts.py`
- Create: `backend/tests/test_assessment.py`
- Create: `backend/tests/test_artifacts.py`
- Create: `backend/data/demo/assessment.json`
- Create: `backend/data/demo/amendment-impact.json`
- Create: `backend/data/demo/manifest.json`

**Interfaces:**
- Consumes: Tasks 2-3 verified artifacts and Task 1 contract unchanged.
- Produces: `evaluate(group: RuleGroup, company: CompanyProfile, as_of: datetime) -> RuleResult`.
- Produces: `assess_versions(input: AssessmentInput) -> AmendmentImpact` as the only public orchestration entry point.
- Produces: `load_demo_bundle(root: Path) -> DemoBundle` with fail-fast cross-artifact lineage verification.
- Self-consistency: recomputing both assessments from the stored company/rules exactly matches cached JSON; the authority change is the only changed input; every manifest hash matches bytes.

- [x] Write table-driven failing tests for exact turnover threshold, one rupee below, missing financial year, unaudited value, bidder legal-entity mismatch, parent/affiliate turnover that must not count, certification valid at anchor, expiry before anchor, missing validity wording, `SINGLE_PROJECT`, `EACH_OF_N_PROJECTS`, aggregate-only semantics, incomplete projects, completion exactly on each inclusive date-window boundary, completion just before and just after the window, EMD availability without qualification, deadline timezone fallback note, `ALL`, `ANY`, `AT_LEAST_N`, explicit not-applicable, closed/cancelled tender, unsupported prose, and missing data never improving a result. Missing bidder entity, project completion state, or completion date produces `UNKNOWN`; known in-progress/out-of-window work does not satisfy the project predicate.
- [x] Add malformed-group regression cases for empty children, `minimum_matches=0`, minimum greater than child count, illegal minimum on `ALL`/`ANY`, and missing minimum on `AT_LEAST_N`. The untrusted model rejects these shapes; a structurally valid but unsupported group evaluates to `UNKNOWN`; no case may produce leaf/group `PASS` or recommendation `BID`.
- [x] Write amendment tests for bidder request rejected, `UNCHANGED`, ambiguous authority statement, explicit authority replacement, new revision/reset review, stale review rejection, and authority-backed recommendation changes while unchanged unresolved certification anchors remain `UNKNOWN`.
- [x] Implement only the four to eight hard rules present in the selected story using `Decimal` and timezone-aware timestamps. Unsupported semantics are represented and evaluate to `UNKNOWN`; do not build a generic expression language.
- [x] Keep extraction, review, and evaluation states independent. `EVIDENCE_VERIFIED` is required for `PASS` or `FAIL`; a materially changed revision additionally remains `UNKNOWN` until its reset review becomes `HUMAN_CONFIRMED` or `HUMAN_EDITED`. `HUMAN_REJECTED` and `INVALID` remain `UNKNOWN`; `NOT_APPLICABLE` requires an explicit verified branch.
- [x] Build one synthetic company so the authoritative changed clause flips the recommendation while all unchanged supported hard rules remain identical. Add separate fixtures for `UNKNOWN` and invalid/boundary coverage rather than weakening the judge-facing transition.
- [x] Verify path containment, SHA-256 shape and bytes, HTTPS official URLs, provider/document lineage, data-mode truthfulness, exact excerpts, processed-page completeness, and cached assessment recomputation in `load_demo_bundle`.
- [x] Run:

```bash
(cd backend && uv run pytest tests/test_assessment.py tests/test_artifacts.py -q)
(cd backend && uv run ruff check src tests)
```

Expected: the selected company changes from base `NO_BID` to amended `REVIEW`; turnover changes from FAIL to PASS while three unchanged certifications remain `UNKNOWN`.

### Task 5 [Implementer B]: Expose the frozen read-only FastAPI API and startup gates

**Files:**
- Create: `backend/src/backend/config.py`
- Create: `backend/src/backend/routes.py`
- Create: `backend/src/backend/main.py`
- Modify: `backend/src/backend/__init__.py`
- Create: `backend/tests/test_api.py`
- Modify: `backend/README.md`

**Interfaces:**
- Consumes: Task 1 OpenAPI and examples; Task 4 `load_demo_bundle` and `assess_versions` only.
- Produces: the exact six GET routes in the frozen contract; no uploads, URL inputs, credentials, or provider mutations.
- Produces: `create_app(settings: Settings) -> FastAPI` with lifespan validation before accepting traffic.
- Self-consistency: generated OpenAPI paths and response bodies match the frozen contract, every envelope has a request ID, and malformed artifacts prevent startup rather than serving partial data.

- [x] Write failing TestClient tests for liveness, readiness, all four API routes, six-to-nine opportunities across three sources, detail evidence, amendment hashes and transition, source proof lineage, unknown opportunity 404 envelope, request ID on success/error, invalid data mode, malformed startup artifact, path escape, and no write/upload/fetch-URL route.
- [x] Implement `Settings` with only demo data directory and server bind settings. Bright Data/OpenAI variables belong to preparation CLIs and are not runtime readiness dependencies.
- [x] Use FastAPI lifespan to load and validate the immutable bundle once. Invalid artifacts raise during startup; `/health/ready` is 200 only after successful load.
- [x] Keep routes thin and response-model validated. Map known not-found/domain errors to safe envelopes; do not expose file paths, excerpts beyond the bounded artifact, document contents, stack traces, or configuration values.
- [x] Add exact backend startup and offline-data instructions to `backend/README.md` without claiming that the real provider/document gates passed until their artifacts exist.
- [x] Run:

```bash
(cd backend && uv run pytest -q)
(cd backend && uv run ruff check src tests scripts ../tools)
```

Then start the server in terminal 1:

```bash
cd backend && uv run uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

From terminal 2, run and then stop terminal 1 cleanly:

```bash
curl -fsS http://127.0.0.1:8000/health/live
curl -fsS http://127.0.0.1:8000/health/ready
curl -fsS http://127.0.0.1:8000/api/v1/opportunities
curl -fsS http://127.0.0.1:8000/api/v1/source-proof
```

Expected: full backend suite passes, startup succeeds from cached artifacts with provider/LLM credentials absent, and all curls return contract-valid JSON.

### Task 6 [Implementer C]: Build the three-view accessible offline frontend against the frozen contract

**Files:**
- Modify: `frontend/app/layout.tsx`
- Modify: `frontend/app/globals.css`
- Modify: `frontend/app/page.tsx`
- Create: `frontend/app/not-found.tsx`
- Create: `frontend/app/loading.tsx`
- Create: `frontend/app/error.tsx`
- Create: `frontend/app/opportunities/[opportunityId]/page.tsx`
- Create: `frontend/app/opportunities/[opportunityId]/amendment/page.tsx`
- Create: focused files under `frontend/components/`
- Create: `frontend/schemas/envelopes.ts`
- Create: `frontend/schemas/opportunities.ts`
- Create: `frontend/schemas/assessment.ts`
- Create: `frontend/lib/api.ts`
- Create: `frontend/tests/api.test.ts`
- Create: `frontend/tests/routes.test.tsx`
- Create: `frontend/tests/states.test.tsx`
- Modify: `frontend/README.md`

**Interfaces:**
- Consumes: Task 1 OpenAPI hash and four manual examples only; C does not import backend code or edit the contract.
- Produces: `getOpportunities`, `getSourceProof`, `getAssessment`, and `getAmendmentImpact` returning Zod-validated values or typed transport/schema/not-found failures.
- Produces: `/`, `/opportunities/[opportunityId]`, and `/opportunities/[opportunityId]/amendment` as Server Component views; only `app/error.tsx` is a Client Component.
- Self-consistency: all Task 1 examples parse in Zod; every rendered status comes from typed data; no test bypasses `frontend/lib/api.ts` when claiming end-to-end boundary coverage.

- [x] Read the exact local Next 16.3.1 docs paths recorded by A before editing. Follow the documented promise-based dynamic params, `notFound()`, loading, error boundary, and dynamic server-fetch behavior.
- [x] Write failing API tests for success, non-2xx, 404, timeout/network error, invalid JSON, extra/missing field, unknown enum, and empty list. Parse the frozen examples in these tests.
- [x] Write failing view/state tests for six-to-nine rows, all three sources, visible data modes, freshness/hash, expandable proof, profile summary, four evaluation states, evidence/review/extraction text, official links, old/new document hashes, actor/disposition/effective change, rejected bidder request no-change, base/amended recommendation transition, empty, loading, 404, backend failure, and schema failure.
- [x] Render `contracts/examples/source-proof.manual.json` in a view/state test. Assert the safe unavailable reason and `MANUAL_FIXTURE`/unavailable label are visible, all provider identifier/timestamp fields remain null and are not fabricated into the DOM, and the disclosure uses keyboard-accessible native `<details>`/`<summary>` semantics with an accessible name.
- [x] Keep pages as Server Components and the API module server-only. Use native `<details>` for proof expansion; do not add polling, TanStack Query, or runtime provider controls.
- [x] Render statuses with text and icon, never color alone. Keep the hard failure/unknown banner above the fold; never render a relevance/readiness/confidence score or claim automated submission/legal advice.
- [x] Replace starter metadata, logos, Vercel links, README copy, and conflicting font declarations. Define semantic surface/text/muted/border/action/focus/success/warning/error/unknown tokens.
- [x] Use landmarks, heading order, table headers, descriptive link text, visible focus, underlined inline links, 44px primary targets, reduced-motion-safe behavior, and a table wrapper that prevents page overflow at 320px. Verify 200% zoom and keyboard-only navigation.
- [x] Ensure `pnpm build` succeeds with the backend unavailable while requests remain runtime-dynamic according to the installed Next docs; do not silently replace a failed backend read with fixtures.
- [x] Run:

```bash
(cd frontend && pnpm test)
(cd frontend && pnpm lint)
(cd frontend && pnpm typecheck)
(cd frontend && pnpm build)
(cd backend && uv run python ../tools/check_code_file_lengths.py)
```

Expected: all three routes and every explicit state have truthful tests; build succeeds without a running backend; every frontend code file is under 200 lines.

### Task 7 [Implementer A]: Integrate, security-review, and rehearse the seven-minute demo

**Files:**
- Create: `tools/check_api_contract.py`
- Create: `tools/smoke_demo.py`
- Create: `tools/check_sensitive_patterns.py`
- Create: `docs/release-review.md`
- Create: `docs/release-runbook.md`
- Create: `docs/release-security.md`
- Create: `docs/release-provenance.md`

**Interfaces:**
- Consumes: frozen Task 1 contract, B's running API/artifacts, and C's built frontend.
- Produces: contract comparison, startup/smoke proof, skeptical-review findings, external-prerequisite status, and a timed offline runbook.
- Self-consistency: every Definition of Done item has fresh command/browser evidence or is marked blocked; the release docs never assert a provider/model/reviewer action that lacks an artifact.

- [x] Make `check_api_contract.py` compare FastAPI's in-process generated OpenAPI and TestClient response bodies with `contracts/api-v1.openapi.json`; fail on path, method, required-field, enum, envelope, or example drift without requiring an already running server.
- [x] Make `smoke_demo.py` start Uvicorn and the built frontend via `pnpm start` with all Bright Data, DeepSeek, and OpenAI credential variables unset, wait boundedly for readiness, request the four API routes and three frontend routes, assert product markers/data-mode labels/hashes/transition, then terminate both processes even on failure.
- [x] Start with a skeptical senior review and write findings before fixes: authority precedence, stale review, unknown coercion, threshold boundaries, false live labels, hash/lineage mismatch, path traversal, unsafe HTML, secret/error leakage, swallowed failures, process cleanup, misleading claims, contract-bypassing tests, code files at 200+ lines, and undocumented named functions. Include file, severity, and reproducible scenario; then fix only accepted findings in the owning task or return them to B/C.
- [x] Run the security review: verify ignores; use `check_sensitive_patterns.py` to scan tracked text and report only path/rule, never matching values; run dependency audits; confirm no arbitrary URL/upload/write route; confirm no `dangerouslySetInnerHTML`, `eval`, shell execution, unsafe deserialization, or string-built SQL; and confirm preparation errors/logs omit credentials and full document text.
- [x] Run both servers and inspect `/`, the tender detail, amendment view, 404, and stopped-backend failure at 1280px, 390px, and 320px. Capture screenshots and verify keyboard order, visible focus, text/icon statuses, 200% zoom, and no page-level horizontal overflow. Loading, empty, unavailable-provider-proof, and schema-failure states must have executable component tests; record `UNAVAILABLE_PROVIDER_PROOF_STATE=PASS` in `docs/release-review.md` only when the safe reason, honest label, null provider fields, and accessible disclosure assertions pass. Do not add demo-only routes.
- [ ] **PENDING - HUMAN REHEARSAL:** Rehearse the exact script with normal network, then with network unavailable and all provider/model credentials absent. The runtime path must use the same cached `RECORDED_BRIGHT_DATA_SNAPSHOT` and verified extraction artifacts in both modes and finish in seven minutes without changing truth labels.
- [x] **STOP-RELEASE:** Stop and report `NOT_READY` if the provider gate, document gate, independent clause review, contract comparison, startup smoke, offline replay, seven-minute timing, security review, responsive/a11y check, or any required command fails. Never replace missing external evidence with a manual fixture.
- [ ] **PENDING - FINAL INTEGRATED GATE:** Run the full final gate after B/C consume the revised contract:

```bash
(cd backend && uv run pytest -q)
(cd backend && uv run ruff check src tests scripts ../tools)
(cd backend && uv run pip-audit)
(cd frontend && pnpm lint)
(cd frontend && pnpm typecheck)
(cd frontend && pnpm test)
(cd frontend && pnpm build)
(cd frontend && pnpm audit --audit-level high)
(cd backend && uv run python ../tools/check_code_file_lengths.py)
(cd backend && uv run python ../tools/check_api_contract.py)
(cd backend && uv run python ../tools/check_sensitive_patterns.py)
(cd backend && uv run python ../tools/smoke_demo.py)
git diff --check
git status --short
```

Expected: every command exits 0, all known changes are intentional, both servers start, all API/frontend routes work, and the same base-to-amendment result is demonstrated offline in under seven minutes.

## Authoritative completion matrix (2026-08-20)

This matrix supersedes stale phase/prerequisite prose in earlier reports while preserving their historical evidence.

| Workstream | Disposition | Evidence |
|---|---|---|
| Task 1 foundation and final A contract/tool revisions | COMPLETE | Task 1 report plus Final fix wave A handoff |
| Task 2 provider proof | COMPLETE | Three successful Bright Data runs; chosen run j_mt0i928kyu57telkk; raw hash b7ff42df...aef |
| Task 3 official extraction/review | COMPLETE | 69-page base and 30-page amendment verified; human review recorded |
| Tasks 4-6 prior implementation/browser work | COMPLETE FOR SUPERSEDED CONTRACT | Reports/reviews and browser evidence |
| Task 7 integration tools/security/browser evidence | COMPLETE FOR SUPERSEDED CONTRACT | Task 7 report; checker/scanner/smoke/browser evidence |
| Revised contract consumption by backend/frontend | PENDING | B/C must consume nullable anchors, applicability union, proof coupling, total invariant, and REVIEW outcome |
| Normal and offline human seven-minute rehearsals | PENDING | Automated smoke timings do not satisfy this human gate |
| Full integrated final gate on revised contract | PENDING | Run only after B/C consumption |
| Two final independent reviews | PENDING | Prior final reviews found this fix wave |
| Final security review/approval | PENDING | Required after all fixes and integrated gates |

- [ ] **PENDING - DOWNSTREAM CONSUMPTION:** B/C consume the revised contract and rebuild immutable runtime/UI artifacts.
- [ ] **PENDING - HUMAN REHEARSALS:** Record checkpoint timings for normal and credentials-absent/offline seven-minute demos.
- [ ] **PENDING - FINAL REVIEWS:** Obtain two independent PASS verdicts.
- [ ] **PENDING - FINAL SECURITY:** Obtain final security approval after integrated gates pass.

---

## Definition of Done

- The root route is an opportunity/source-proof view and FastAPI starts on port 8000.
- Six to nine records render, with two or three per CPPP, West Bengal, and NTPC and honest data modes.
- One real Bright Data proof traces the chosen provider ID to captured raw bytes/hash to the exact normalized record; provider failure is separately tested and visible.
- One official digital-text base/amendment pair has every text-bearing page processed, valid bounded citations, immutable hashes, an independently confirmed authority change, and cached offline extraction.
- The same synthetic company produces the verified base and amended decisions; a rejected bidder request produces no change.
- All four evaluation states, authority ambiguity, invalid input, empty data, exact boundaries, provider failure, 404, backend/schema failure, and offline replay are covered.
- All four read-only API routes, two health routes, three frontend routes, and loading/empty/404/failure states match the frozen contract.
- Security, responsive behavior, keyboard/focus/accessibility, dependency audits, line policy, documentation policy, and the seven-minute demo have fresh evidence.
- The broader two-base-document/20-to-30-clause evaluation dataset is not claimed by this hackathon slice; the release reports exact counts for the one locked pair and labels the broader evaluation as post-hackathon work.

## Stop condition

Stop after Task 7. Do not add authentication, uploads, more collectors, OCR, scheduling, client caching, scoring, alerts, chat, deployment vendors, or production infrastructure. Missing provider/document/reviewer evidence blocks release; it does not authorize scope expansion or fabricated proof.
