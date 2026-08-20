# BidRadar AI Hackathon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a failure-tolerant demo that proves a Bright Data sourced government IT opportunity can be evaluated against a synthetic contractor, then re-evaluated when an authoritative corrigendum changes an operative hard requirement.

**Architecture:** Keep the existing Next.js and Python folders. A single FastAPI process reads content-addressed JSON artifacts, verifies digital-text tender evidence, runs deterministic rule evaluation, and exposes six small endpoints. Next.js Server Components render three routes; one optional Client Component polls a live NTPC source run. No database, authentication, uploads, generic job system, numeric scoring, or client cache is added.

**Tech Stack:** Next.js 16.3.1, React 19.2.8, TypeScript 5 strict, Tailwind CSS 4, pnpm 10.30.1, Zod 4.4.3, Python 3.13, uv, FastAPI 0.141.1, Pydantic 2.13.4, pydantic-settings 2.15.0, HTTPX 0.28.1, pypdf 6.16.1, OpenAI SDK 3.2.0, Uvicorn 0.52.3, pytest 9.1.1, Ruff 0.16.3, Vitest 4.1.10, React Testing Library 16.3.2, jsdom 30.0.1.

**Spec:** `docs/superpowers/specs/2026-08-18-bidradar-hackathon-design.md`

## Global Constraints

- Preserve the current `frontend/` Next.js App Router and `backend/` Python package.
- Every authored code file must remain under 200 lines.
- Every named application function must have concise production-style JSDoc or a Python docstring.
- Use Zod only at untrusted TypeScript boundaries: environment, URL/search input, forms, backend responses, external snapshots, and disk fixtures.
- Do not add TanStack Query or TanStack Devtools unless a new design review proves multiple independent cache/mutation workflows are unavoidable.
- Do not add authentication, company-document upload, a database, ORM, migrations, Redis, Celery, a generic worker, OCR, or numeric fit/readiness scoring.
- Never bypass CAPTCHA, login, robots policy, or portal access controls.
- Never label recorded Bright Data snapshots or manual fixtures as live.
- Only explicit authority-issued changes can alter an effective tender requirement.
- Missing, ambiguous, unsupported, unverified, or changed-but-unreviewed hard rules evaluate to `UNKNOWN`.
- Runtime secrets stay outside source control and logs. `.env.example` contains names only. If a later AWS deployment uses Secrets Manager, use `asm-exec` dynamic references; never retrieve secret values into agent output.
- Before adding any dependency, verify the current stable version and compatibility from its primary registry or official documentation; update the version table in this plan if it changed.

## File map

```text
backend/
  pyproject.toml
  src/backend/
    main.py
    config.py
    api/opportunities.py
    api/sources.py
    domain/source.py
    domain/rules.py
    domain/assessment.py
    domain/amendment.py
    services/artifacts.py
    services/normalization.py
    services/documents.py
    services/extraction.py
    services/eligibility.py
    services/amendments.py
    services/source_runs.py
    adapters/bright_data.py
    adapters/llm.py
  data/demo/manifest.example.json
  data/demo/opportunities.json
  data/demo/company_profile.json
  data/demo/extractions/base.json
  data/demo/extractions/amendment.json
  tests/unit/
  tests/integration/
  tests/fixtures/
frontend/
  app/page.tsx
  app/opportunities/[opportunityId]/page.tsx
  app/opportunities/[opportunityId]/amendment/page.tsx
  app/loading.tsx
  app/error.tsx
  components/opportunity-table.tsx
  components/source-proof.tsx
  components/requirement-card.tsx
  components/amendment-comparison.tsx
  components/run-status.tsx
  lib/api.ts
  schemas/api.ts
  tests/
  scripts/
    extract_demo.py
scrapers/ntpc/
  interaction.js
  parser.js
tools/
  check_code_file_lengths.py
```

The implementer may adjust a proposed filename only when an existing repository convention discovered at implementation time is stronger. Record the deviation in the task commit.

---

### Task 1: Establish the quality harness and dependency floor

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/tests/setup.ts`
- Create: `tools/check_code_file_lengths.py`
- Create: `backend/tests/unit/test_file_policy.py`

**Interfaces:**
- Consumes: existing Python 3.13 `uv` package and existing frontend scripts.
- Produces: `check_paths(paths: Sequence[Path], limit: int = 199) -> list[Violation]` and reproducible lint/type/test commands.

- [ ] **Step 1: Confirm current package versions before editing**

Run:

```bash
cd frontend
pnpm view zod version
pnpm view vitest version
pnpm view @testing-library/react version
pnpm view jsdom version
cd ../backend
curl -fsSL https://pypi.org/pypi/fastapi/json | jq -r .info.version
curl -fsSL https://pypi.org/pypi/pydantic/json | jq -r .info.version
curl -fsSL https://pypi.org/pypi/pydantic-settings/json | jq -r .info.version
curl -fsSL https://pypi.org/pypi/httpx/json | jq -r .info.version
curl -fsSL https://pypi.org/pypi/pypdf/json | jq -r .info.version
curl -fsSL https://pypi.org/pypi/openai/json | jq -r .info.version
curl -fsSL https://pypi.org/pypi/uvicorn/json | jq -r .info.version
curl -fsSL https://pypi.org/pypi/pytest/json | jq -r .info.version
curl -fsSL https://pypi.org/pypi/ruff/json | jq -r .info.version
```

Expected on 2026-08-18: Zod `4.4.3`, Vitest `4.1.10`, Testing Library `16.3.2`, jsdom `30.0.1`, FastAPI `0.141.1`, Pydantic `2.13.4`, pydantic-settings `2.15.0`, HTTPX `0.28.1`, pypdf `6.16.1`, OpenAI SDK `3.2.0`, Uvicorn `0.52.3`, pytest `9.1.1`, and Ruff `0.16.3`. If a stable version changed, use the new stable version and record it in the commit.

- [ ] **Step 2: Write the failing file-policy test**

```python
def test_reports_authored_code_over_limit(tmp_path: Path) -> None:
    code_file = tmp_path / "oversized.py"
    code_file.write_text("\n".join("pass" for _ in range(200)), encoding="utf-8")

    violations = check_paths([tmp_path], limit=199)

    assert violations[0].path == code_file
    assert violations[0].line_count == 200
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `cd backend && uv run pytest tests/unit/test_file_policy.py -q`
Expected: FAIL because `check_paths` is not defined.

- [ ] **Step 4: Add minimal dependencies and scripts**

Run:

```bash
cd backend
uv add "fastapi==0.141.1" "pydantic==2.13.4" "pydantic-settings==2.15.0" "httpx==0.28.1" "pypdf==6.16.1" "openai==3.2.0" "uvicorn==0.52.3"
uv add --dev "pytest==9.1.1" "ruff==0.16.3"
cd ../frontend
pnpm add "zod@4.4.3"
pnpm add -D "vitest@4.1.10" "@testing-library/react@16.3.2" "jsdom@30.0.1"
```

Add `test`, `typecheck`, and `check:lines` scripts to `frontend/package.json`. Do not add TanStack packages.

- [ ] **Step 5: Implement the line checker**

The checker must:

- scan `.py`, `.ts`, `.tsx`, `.js`, and `.mjs`;
- exclude `.git`, `.next`, `node_modules`, lockfiles, generated files, and private demo artifacts;
- count physical lines;
- return all violations deterministically sorted;
- exit non-zero when any file reaches 200 lines.

- [ ] **Step 6: Run the quality baseline**

```bash
(cd backend && uv run pytest tests/unit/test_file_policy.py -q)
(cd backend && uv run ruff check src tests ../tools)
(cd frontend && pnpm lint)
(cd frontend && pnpm exec tsc --noEmit)
(cd frontend && pnpm test --run)
(cd backend && uv run python ../tools/check_code_file_lengths.py)
```

Expected: all commands pass.

- [ ] **Step 7: Commit**

```bash
git add backend/pyproject.toml backend/uv.lock frontend/package.json frontend/pnpm-lock.yaml frontend/vitest.config.ts frontend/tests/setup.ts tools/check_code_file_lengths.py backend/tests/unit/test_file_policy.py
git commit -m "build: establish quality and file-size gates"
```

### Task 2: Define the shared contracts and honest demo fixtures

**Files:**
- Create: `backend/src/backend/domain/source.py`
- Create: `backend/src/backend/domain/rules.py`
- Create: `backend/src/backend/domain/assessment.py`
- Create: `backend/src/backend/domain/amendment.py`
- Create: `backend/data/demo/opportunities.json`
- Create: `backend/data/demo/company_profile.json`
- Create: `backend/data/demo/manifest.example.json`
- Create: `frontend/schemas/api.ts`
- Create: `backend/tests/unit/test_contracts.py`
- Create: `frontend/tests/api-schemas.test.ts`

**Interfaces:**
- Produces: `OpportunitySummary`, `DocumentVersion`, `AuthorityStatement`, `RuleGroup`, `RuleLeaf`, `EvidenceSpan`, `CompanyProfile`, `Assessment`, and `AmendmentImpact` Pydantic models.
- Produces: matching Zod schemas exported from `frontend/schemas/api.ts`.
- Invariant: every backend contract fixture must parse in both Pydantic and Zod.

- [ ] **Step 1: Write failing backend contract tests**

Cover:

- a CPPP record with a null estimated value;
- a West Bengal record labelled `RECORDED_BRIGHT_DATA_SNAPSHOT`;
- an NTPC record with a valid SHA-256;
- rejection of an unknown data mode;
- rejection of an HTTP URL when HTTPS is required;
- rejection of an invalid SHA-256 or naive timestamp.

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && uv run pytest tests/unit/test_contracts.py -q`
Expected: FAIL because the domain models do not exist.

- [ ] **Step 3: Implement the Pydantic contracts**

Use string enums for every state. Money is a decimal string plus currency, never a float. Timestamps are timezone-aware. `RuleGroup` supports `ALL`, `ANY`, and `AT_LEAST_N`; validate that `minimum_matches` is present only for `AT_LEAST_N`.

- [ ] **Step 4: Add six to nine honest opportunity fixtures**

Each fixture contains:

- official source URL;
- source and source tender ID;
- authority and title;
- visible `data_mode`;
- snapshot hash;
- source timestamp;
- no invented value for missing data.

Use only public metadata. Do not commit tender PDFs or company documents.

- [ ] **Step 5: Write matching Zod schemas and failing frontend tests**

```ts
it("rejects a fixture falsely labelled as live without a run id", () => {
  expect(() => opportunitySchema.parse({ ...fixture, dataMode: "LIVE", runId: null })).toThrow();
});
```

- [ ] **Step 6: Run contract tests**

```bash
(cd backend && uv run pytest tests/unit/test_contracts.py -q)
(cd frontend && pnpm test --run tests/api-schemas.test.ts)
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/backend/domain backend/data/demo frontend/schemas/api.ts backend/tests/unit/test_contracts.py frontend/tests/api-schemas.test.ts
git commit -m "feat: define procurement evidence contracts"
```

### Task 3: Implement deterministic hard-rule evaluation

**Files:**
- Create: `backend/src/backend/services/eligibility.py`
- Create: `backend/tests/unit/test_eligibility.py`
- Create: `backend/tests/fixtures/company_profiles.json`

**Interfaces:**
- Consumes: `RuleGroup`, `RuleLeaf`, `CompanyProfile`.
- Produces: `evaluate(group: RuleGroup, company: CompanyProfile, as_of: datetime) -> RuleResult`.
- Produces: `recommend(results: Sequence[RuleResult], lifecycle: TenderLifecycle) -> BID | REVIEW | NO_BID`.

- [ ] **Step 1: Write a table-driven failing test matrix**

Include:

- turnover exactly equal to the threshold passes;
- one rupee below fails;
- missing one named financial year is unknown;
- certification valid on the explicit anchor passes;
- certification expired one day earlier fails;
- three two-crore projects do not satisfy a five-crore `SINGLE_PROJECT` rule;
- `EACH_OF_N_PROJECTS` validates every counted project;
- EMD exemption availability without qualification is unknown;
- unsupported similar-work language is unknown;
- missing data never becomes pass;
- `ALL`, `ANY`, and `AT_LEAST_N` propagate states correctly.

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && uv run pytest tests/unit/test_eligibility.py -q`
Expected: FAIL because the evaluator does not exist.

- [ ] **Step 3: Implement only the selected leaf predicates**

Use `Decimal` for INR. Keep each predicate in a named, documented function. Do not build a plugin system or generic expression language.

- [ ] **Step 4: Implement the recommendation policy**

```text
confirmed hard FAIL -> NO_BID
no FAIL and at least one hard UNKNOWN -> REVIEW
all applicable supported hard rules PASS or NOT_APPLICABLE -> BID
closed or cancelled tender -> NO_BID
```

- [ ] **Step 5: Run tests and review invariants**

Run: `cd backend && uv run pytest tests/unit/test_eligibility.py -q`
Expected: PASS with explicit cases for every state transition.

- [ ] **Step 6: Commit**

```bash
git add backend/src/backend/services/eligibility.py backend/tests/unit/test_eligibility.py backend/tests/fixtures/company_profiles.json
git commit -m "feat: evaluate supported tender requirements"
```

### Task 4: Add safe digital-text document parsing and provenance verification

**Files:**
- Create: `backend/src/backend/services/documents.py`
- Create: `backend/src/backend/services/artifacts.py`
- Create: `backend/tests/unit/test_documents.py`
- Create: `backend/tests/fixtures/documents/base.txt`
- Create: `backend/tests/fixtures/documents/amendment.txt`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `parse_pdf(path: Path, limits: DocumentLimits) -> ParsedDocument`.
- Produces: `verify_evidence(document: ParsedDocument, span: EvidenceSpan) -> bool`.
- Produces: `store_artifact(data: bytes, directory: Path, suffix: str) -> StoredArtifact` keyed by SHA-256.

- [ ] **Step 1: Write failing tests**

Test:

- page numbering is one-based;
- identical bytes produce the same content-addressed path;
- a bounded excerpt is found after whitespace normalization;
- a page mismatch returns false;
- empty/scanned-like text is `NEEDS_OCR`;
- corrupt, password-protected, oversized, and over-page-limit PDFs are rejected;
- private demo artifact paths are ignored by git.

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && uv run pytest tests/unit/test_documents.py -q`
Expected: FAIL because parsing and artifact functions do not exist.

- [ ] **Step 3: Implement content-addressed storage and parser limits**

Default demo limits:

- PDF only;
- 25 MiB;
- 80 pages;
- no encrypted PDFs;
- no embedded attachment extraction;
- no OCR.

Commit synthetic text fixtures only. Keep real tender documents under `backend/data/private-demo/`, which must be gitignored.

- [ ] **Step 4: Implement evidence verification**

Normalize Unicode and whitespace but do not paraphrase. The exact bounded excerpt must occur on the declared physical page. A mismatch invalidates the extraction.

- [ ] **Step 5: Run tests**

Run: `cd backend && uv run pytest tests/unit/test_documents.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .gitignore backend/src/backend/services/documents.py backend/src/backend/services/artifacts.py backend/tests/unit/test_documents.py backend/tests/fixtures/documents
git commit -m "feat: verify page-level tender evidence"
```

### Task 5: Build the offline structured extraction preparation path

**Files:**
- Create: `backend/src/backend/adapters/llm.py`
- Create: `backend/src/backend/services/extraction.py`
- Create: `backend/scripts/extract_demo.py`
- Create: `backend/tests/unit/test_extraction.py`
- Create: `backend/data/demo/extractions/base.json`
- Create: `backend/data/demo/extractions/amendment.json`

**Interfaces:**
- Produces: `ExtractionClient.extract(pages: Sequence[PageText], schema_version: str) -> ProposedExtraction`.
- Produces: `verify_extraction(document: ParsedDocument, proposed: ProposedExtraction) -> VerifiedExtraction`.
- The runtime application consumes verified cached JSON; it does not require a live model call.

- [ ] **Step 1: Write failing extraction tests with a fake client**

Cover:

- unknown fields are rejected;
- unsupported rule kinds are rejected;
- prompt-injection text cannot add a tool call or instruction field;
- an excerpt on the wrong page becomes `INVALID`;
- an evidence-matched proposal becomes `EVIDENCE_VERIFIED`;
- unreviewed materially changed hard rules cannot evaluate to pass or fail.

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && uv run pytest tests/unit/test_extraction.py -q`
Expected: FAIL because the extraction services do not exist.

- [ ] **Step 3: Implement the narrow adapter**

The adapter must:

- use structured outputs with a closed Pydantic schema;
- pass every text-bearing page of the selected document set in bounded chunks;
- give the model no tools, network access, or credentials;
- state that document content is untrusted data;
- record model ID, prompt hash, schema version, and generated timestamp;
- never calculate eligibility.

Use an environment variable such as `OPENAI_API_KEY` only at runtime. Do not log it or include it in fixtures.

- [ ] **Step 4: Implement the offline preparation script**

`extract_demo.py` loads the private PDFs, calls the adapter, verifies every evidence span, writes content-addressed verified JSON, and exits non-zero if any accepted hard rule lacks valid evidence.

- [ ] **Step 5: Review and freeze the demo extraction**

One domain reviewer must human-confirm the eligibility-changing base and amendment clauses. Store only bounded excerpts and hashes in committed JSON; retain real PDFs privately and temporarily.

- [ ] **Step 6: Run tests**

Run: `cd backend && uv run pytest tests/unit/test_extraction.py -q`
Expected: PASS. The offline script is exercised with a fake client in CI.

- [ ] **Step 7: Commit**

```bash
git add backend/src/backend/adapters/llm.py backend/src/backend/services/extraction.py backend/scripts/extract_demo.py backend/tests/unit/test_extraction.py backend/data/demo/extractions
git commit -m "feat: prepare verified tender extractions"
```

### Task 6: Model authoritative amendments and deterministic impact

**Files:**
- Create: `backend/src/backend/services/amendments.py`
- Create: `backend/tests/unit/test_amendments.py`

**Interfaces:**
- Produces: `classify_statement(document_role, actor, disposition, old_rule, new_rule) -> EffectiveChange`.
- Produces: `compare_assessments(base: Assessment, amended: Assessment) -> AmendmentImpact`.

- [ ] **Step 1: Write failing authority-precedence tests**

Include:

- bidder asks to relax turnover and authority rejects: no effective change;
- authority says conditions remain unchanged: no effective change;
- authority-issued corrigendum replaces a threshold: effective change;
- ambiguous clarification: unknown and review;
- changed clause creates a new rule revision and resets review state;
- base fail to amended pass changes `NO_BID` to `BID` only when no other hard unknown exists.

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && uv run pytest tests/unit/test_amendments.py -q`
Expected: FAIL because amendment classification does not exist.

- [ ] **Step 3: Implement the minimum amendment semantics**

Do not use title similarity or a generic semantic-diff framework. Link the curated pair through official reference IDs and document lineage. Preserve old and new assessments as immutable JSON artifacts.

- [ ] **Step 4: Run tests**

Run: `cd backend && uv run pytest tests/unit/test_amendments.py -q`
Expected: PASS, including the rejected-bidder-request regression.

- [ ] **Step 5: Commit**

```bash
git add backend/src/backend/services/amendments.py backend/tests/unit/test_amendments.py
git commit -m "feat: evaluate authoritative tender amendments"
```

### Task 7: Prove one real Bright Data source path

**Files:**
- Create: `scrapers/ntpc/interaction.js`
- Create: `scrapers/ntpc/parser.js`
- Create: `backend/src/backend/adapters/bright_data.py`
- Create: `backend/src/backend/services/normalization.py`
- Create: `backend/src/backend/services/source_runs.py`
- Create: `backend/tests/unit/test_normalization.py`
- Create: `backend/tests/integration/test_source_run.py`

**Interfaces:**
- Produces: `BrightDataClient.trigger(input_rows) -> ProviderRun`.
- Produces: `BrightDataClient.status(provider_id) -> ProviderStatus`.
- Produces: `BrightDataClient.download(provider_id) -> bytes`.
- Produces: `normalize_ntpc(raw: NTPCRawRecord, proof: SourceProof) -> OpportunitySummary`.

- [ ] **Step 1: Run the manual source feasibility gate before coding the adapter**

For NTPC, CPPP, and West Bengal:

- inspect current robots and portal policy;
- perform three minimal public-page collector runs;
- record required-field completeness;
- stop on authentication, CAPTCHA, or circumvention;
- select NTPC only if it passes.

If NTPC fails, use CPPP public latest listings. Do not silently switch to an unreviewed source.

- [ ] **Step 2: Write failing normalization tests from a saved raw record**

Test exact source ID, authority, title, deadline timezone, official URL, data mode, run ID, and snapshot hash. A raw record without a stable source ID is quarantined.

- [ ] **Step 3: Implement and version the Scraper Studio collector**

The collector must collect only public fields needed by the canonical contract. It must not log in, solve CAPTCHA, follow unrelated pages, or download every document.

- [ ] **Step 4: Implement the adapter with safe retry rules**

Retry bounded network failures, 429, and provider 5xx with jitter. Do not retry authentication, invalid configuration, schema rejection, or access-policy failure. Persist safe run metadata and content-addressed raw snapshots; never log the bearer token.

- [ ] **Step 5: Write the integration test with mocked HTTP**

Prove:

- trigger returns a provider ID;
- polling reaches ready;
- download bytes are hashed;
- identical downloads reuse the same artifact;
- normalized output retains the proof;
- terminal provider failure is visible and does not become live data.

- [ ] **Step 6: Run tests and capture one real proof artifact**

```bash
cd backend && uv run pytest tests/unit/test_normalization.py tests/integration/test_source_run.py -q
```

Expected: PASS. A real historical provider run ID and snapshot hash are recorded in the private demo manifest without committing credentials.

- [ ] **Step 7: Commit**

```bash
git add scrapers/ntpc backend/src/backend/adapters/bright_data.py backend/src/backend/services/normalization.py backend/src/backend/services/source_runs.py backend/tests/unit/test_normalization.py backend/tests/integration/test_source_run.py
git commit -m "feat: prove Bright Data tender ingestion"
```

### Task 8: Expose the six FastAPI endpoints

**Files:**
- Modify: `backend/src/backend/main.py`
- Create: `backend/src/backend/config.py`
- Create: `backend/src/backend/api/opportunities.py`
- Create: `backend/src/backend/api/sources.py`
- Create: `backend/tests/integration/test_api.py`

**Interfaces:**
- Implements the six endpoints fixed in the design.
- Responses are Pydantic validated and include `request_id`.
- No endpoint accepts an arbitrary fetch URL or uploaded file.

- [ ] **Step 1: Write failing API tests**

Test:

- opportunity list contains all three sources and honest data modes;
- detail returns requirements and source evidence;
- amendment endpoint returns old/new clauses and outcomes;
- source proof links raw hash to normalized record;
- invalid opportunity ID returns a safe 404 envelope;
- optional source run returns safe status without leaking secrets;
- malformed configured fixture causes readiness failure, not partial success.

- [ ] **Step 2: Run and verify failure**

Run: `cd backend && uv run pytest tests/integration/test_api.py -q`
Expected: FAIL because the routes do not exist.

- [ ] **Step 3: Implement settings and fail-fast startup**

Settings validate artifact directories, allowed source domains, Bright Data collector ID, and optional token presence. Error messages mention missing variable names but never values.

- [ ] **Step 4: Implement routes as thin composition**

Routes call existing services and contain no rule or document logic. Keep each route module below 150 lines.

- [ ] **Step 5: Run API and full backend tests**

```bash
cd backend
uv run pytest -q
uv run ruff check src tests ../tools
uv run uvicorn backend.main:app --port 8000
```

Expected: tests pass; `/health/live` and `/health/ready` return 200 when artifacts are valid.

- [ ] **Step 6: Commit**

```bash
git add backend/src/backend/main.py backend/src/backend/config.py backend/src/backend/api backend/tests/integration/test_api.py
git commit -m "feat: expose tender evidence API"
```

### Task 9: Build the three-view Next.js demo

**Files:**
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/app/layout.tsx`
- Modify: `frontend/app/globals.css`
- Create: `frontend/app/loading.tsx`
- Create: `frontend/app/error.tsx`
- Create: `frontend/app/opportunities/[opportunityId]/page.tsx`
- Create: `frontend/app/opportunities/[opportunityId]/amendment/page.tsx`
- Create: `frontend/components/opportunity-table.tsx`
- Create: `frontend/components/source-proof.tsx`
- Create: `frontend/components/requirement-card.tsx`
- Create: `frontend/components/amendment-comparison.tsx`
- Create: `frontend/components/run-status.tsx`
- Create: `frontend/lib/api.ts`
- Create: `frontend/tests/opportunities.test.tsx`
- Create: `frontend/tests/eligibility.test.tsx`
- Create: `frontend/tests/amendment.test.tsx`

**Interfaces:**
- Consumes: the six FastAPI endpoints through `frontend/lib/api.ts`.
- Produces: three routes with Server Component initial reads.
- `RunStatus` is the only client component and uses native fetch polling only when the optional run endpoint is enabled.

- [ ] **Step 1: Write failing component tests**

Prove:

- every record shows source and data-mode text;
- a score is never rendered;
- hard fail banner is persistent;
- unknown is distinct from fail;
- every requirement exposes page, section, excerpt, extraction state, and review state;
- rejected bidder requests show `No effective change`;
- an authority replacement shows old/new clauses and recommendation transition;
- icons include accessible text and do not rely only on color.

- [ ] **Step 2: Run and verify failure**

Run: `cd frontend && pnpm test --run`
Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the API boundary**

Every backend response is parsed with the matching Zod schema. `fetch` failures and schema failures produce explicit error states. Do not use `as`, `any`, or silent fallback data.

- [ ] **Step 4: Implement the opportunity/source-proof view**

The page is a Server Component. Render six to nine rows, source freshness, data modes, and an expandable proof. A live run button appears only when configured.

- [ ] **Step 5: Implement the tender eligibility view**

Render the selected synthetic profile, result banner, supported requirement cards, evidence, and official links. Keep the hard failure or unknown visible above the fold.

- [ ] **Step 6: Implement the amendment view**

Render document role, actor, disposition, effective-change state, old/new clauses, old/new predicates, old/new results, and recommendation transition.

- [ ] **Step 7: Run frontend verification**

```bash
cd frontend
pnpm lint
pnpm exec tsc --noEmit
pnpm test --run
pnpm build
```

Expected: all commands pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/app frontend/components frontend/lib frontend/schemas frontend/tests frontend/package.json frontend/pnpm-lock.yaml
git commit -m "feat: present source-backed bid eligibility"
```

### Task 10: Freeze, security-review, and rehearse the demo

**Files:**
- Create: `docs/demo-script.md`
- Create: `docs/data-provenance.md`
- Create: `docs/security-notes.md`
- Modify: `backend/data/demo/manifest.example.json`

**Interfaces:**
- Produces: a seven-minute deterministic runbook, artifact manifest, and explicit limitations.
- No production deployment or external account mutation is required.

- [ ] **Step 1: Run the full deterministic gate**

```bash
(cd backend && uv run pytest -q)
(cd backend && uv run ruff check src tests ../tools)
(cd frontend && pnpm lint)
(cd frontend && pnpm exec tsc --noEmit)
(cd frontend && pnpm test --run)
(cd frontend && pnpm build)
(cd backend && uv run python ../tools/check_code_file_lengths.py)
```

Record the exact command output in the handoff.

- [ ] **Step 2: Run the security review**

Check:

- `.gitignore` excludes `.env`, private PDFs, generated artifacts, and temporary snapshots;
- `rg` finds no API token, private key, bearer value, password, signed URL, or real company document;
- dependency audits have no unresolved critical or high issue relevant to the demo;
- no endpoint accepts arbitrary URLs or uploads;
- source links are allowlisted;
- model output cannot render raw HTML;
- errors and logs omit document content and secrets.

- [ ] **Step 3: Perform the skeptical senior review before editing**

List concrete findings with file locations, severity, and a reproducible failure scenario. Check:

- incorrect authority precedence;
- missing unknown propagation;
- stale review state after amendment;
- threshold boundaries;
- misleading live/snapshot labels;
- tests that prove rendering but not the required behavior;
- files at or above 200 lines;
- undocumented named functions.

Fix only accepted findings and rerun the relevant gates.

- [ ] **Step 4: Rehearse three demo modes**

Run the complete script with:

1. normal network;
2. network unavailable and recorded Bright Data snapshot replayed;
3. LLM unavailable and cached verified extraction used.

Expected: all three complete in seven minutes without changing the truth labels.

- [ ] **Step 5: Commit**

```bash
git add docs/demo-script.md docs/data-provenance.md docs/security-notes.md backend/data/demo/manifest.example.json
git commit -m "docs: freeze verified hackathon demo"
```

## Stop condition

Stop after Task 10. Do not add auth, uploads, more sources, OCR, client caching, scoring, alerts, chat, deployment vendors, or production infrastructure during this plan. Each requires a separately approved post-hackathon design.
