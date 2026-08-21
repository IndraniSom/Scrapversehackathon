# BidRadar AI Hackathon Design

**Status:** Reviewed architectural specification<br>
**Date:** 2026-08-18<br>
**Product wedge:** A corrigendum-aware eligibility engine for Indian government IT tenders that proves every decision with source citations.

## 1. Outcome

The hackathon build is not a national tender search engine. It is one trustworthy vertical slice:

1. represent public opportunities from CPPP, West Bengal eProcurement, and NTPC;
2. prove that at least one record came through a real Bright Data Scraper Studio run;
3. deeply analyze one digital-text IT or cybersecurity tender and one authoritative amendment;
4. compare both tender versions with one synthetic contractor profile;
5. show a source-backed hard eligibility result before and after the amendment;
6. never hide uncertainty, unsupported clauses, stale source data, or fixture data.

The judge-facing claim is:

> This contractor failed this exact clause in the base tender. An authority-issued corrigendum changed the operative clause. The same deterministic rules now produce a different result, and every input is traceable to the original document.

## 2. Target user and job

The primary user is a founder, bid manager, presales lead, or business-development manager at a small or medium Indian IT contractor.

The job to be done is:

> When an IT tender or corrigendum appears, tell me whether my company satisfies the supported hard requirements, show the exact evidence, expose what is unknown, and explain whether the authoritative amendment changed the decision.

This is decision support, not legal advice, a guarantee of eligibility, or automated bid submission.

## 3. Locked scope

### Included

- Three represented source types:
  - central: [CPPP ePublishing](https://www.eprocure.gov.in/epublish/app);
  - state: [West Bengal eProcurement](https://wbtenders.gov.in/nicgep/app?page=Web);
  - PSU: [NTPC Tender Portal](https://ntpctender.ntpc.co.in/).
- Two or three normalized opportunity records from each source.
- One real Bright Data collector path, with NTPC as the first candidate.
- A completed Bright Data run or snapshot ID, run timestamp, raw record, raw snapshot SHA-256, normalized record, and explicit data-mode label.
- One deeply processed base tender and one authoritative amendment.
- One structured synthetic contractor profile.
- Four to eight hard requirements needed by the selected tender.
- Digital-text PDF extraction across every text-bearing page of the selected document set.
- Clause-level provenance and a deterministic four-state evaluation.
- Three product views: opportunity/source proof, tender eligibility, and amendment impact.
- A recorded real Bright Data snapshot fixture available only to automated E2E tests.

### Excluded

- Authentication, registration, multi-tenancy, and roles.
- Company-document upload, signed URLs, malware infrastructure, and customer retention workflows.
- Supabase, Vercel, AWS App Runner, or another deployment vendor as an architectural requirement.
- PostgreSQL, ORM repositories, Alembic, Redis, Celery, or a generic job queue.
- Automated scheduling or continuous nationwide monitoring.
- Cross-source automatic duplicate merging.
- OCR, scanned-PDF support, multilingual extraction, and a 300-page support claim.
- Numeric fit, readiness, confidence, or weighted recommendation scores.
- TanStack Query and TanStack Query Devtools; the minimum slice does not need a client cache.
- Chat, semantic search, vector storage, alerts, exports, proposal generation, award analytics, pre-tender prediction, and bid submission.

## 4. Verified facts and unresolved gates

### Officially verified

- CPPP ePublishing publicly presents tender enquiries, corrigenda, and award information. Its latest listings are public, while some search flows use CAPTCHA. The application must not automate or bypass CAPTCHA.
- West Bengal eProcurement publicly presents tender details and corrigenda, including IT/WEBEL examples. Public access does not establish commercial reuse rights.
- NTPC publicly presents live and future NITs, award details, and NITs with corrigenda. Current public results include IT and cybersecurity opportunities.
- Bright Data Scraper Studio supports custom collectors and an asynchronous collection workflow that returns structured data and supports later snapshot retrieval.
- Zod 4 is stable and is appropriate for validating untrusted TypeScript input.
- Next.js App Router pages and layouts are Server Components by default; client components should be limited to interactive boundaries.
- The official Department of Expenditure publishes [General Financial Rules updated through 31 January 2026](https://doe.gov.in/bi-annual-compilationupdation-general-financial-rules-2017-upto-31012026general-financial-rules).
- The Ministry of Electronics and Information Technology publishes the [Digital Personal Data Protection Rules 2025](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa).

### Unresolved implementation gates

Before a source is called usable, a real collector spike must prove:

- three successful small runs;
- no login, CAPTCHA bypass, or circumvention;
- stable tender identifier, title, authority, dates, and detail URL;
- acceptable robots and portal-policy review;
- a reproducible raw snapshot;
- document and amendment links needed for the selected demo story.

If NTPC fails this gate, use CPPP's public latest listing as the second collector candidate. West Bengal remains snapshot-first until its current operational stability is proven; an alleged August 2026 transition was not independently confirmed and must not be stated as fact.

## 5. Data modes and source proof

Every source record has one visible `data_mode`:

- `LIVE`: returned by the current run during the session;
- `RECORDED_BRIGHT_DATA_SNAPSHOT`: produced by a real earlier Bright Data run;
- `MANUAL_FIXTURE`: authored for deterministic testing or demo fallback.

The UI must never render a recorded snapshot or fixture as live.

A valid Bright Data proof contains:

- collector name and collector configuration version;
- provider run or snapshot identifier;
- started and completed timestamps;
- raw snapshot SHA-256;
- one raw source record;
- its normalized record;
- data mode;
- terminal success or safe failure details.

The new live run is optional during judging. A previously completed, reproducible Bright Data run is sufficient proof; a hand-authored JSON fixture is not.

## 6. Canonical model

### Opportunity summary

```text
OpportunitySummary
  id: string
  source: CPPP | WEST_BENGAL | NTPC
  source_tender_id: string
  reference_number: string | null
  authority: string
  title: string
  category: CLOUD | CYBERSECURITY | SOFTWARE | DATA_CENTER | MANAGED_IT | NETWORKING | ERP | DEVOPS | OTHER
  published_at: ISO-8601 timestamp | null
  closes_at: ISO-8601 timestamp | null
  canonical_url: https URL
  data_mode: LIVE | RECORDED_BRIGHT_DATA_SNAPSHOT | MANUAL_FIXTURE
  snapshot_sha256: lowercase hex string
```

Unknown values remain `null`; zero and exemption are never inferred from missing text.

### Document and authority model

```text
DocumentVersion
  id: string
  role: BASE_TENDER | CORRIGENDUM | CLARIFICATION | PRE_BID_RESPONSE | REPLACEMENT
  source_url: https URL
  sha256: lowercase hex string
  physical_page_count: positive integer
  text_quality: SUPPORTED | NEEDS_OCR | INVALID

AuthorityStatement
  actor: AUTHORITY | BIDDER | THIRD_PARTY
  disposition: ACCEPTED | REJECTED | CLARIFIED | UNCHANGED | AMBIGUOUS
  effective_change: boolean
```

Only an authority-issued statement that explicitly changes or replaces an operative clause may alter an effective requirement. A bidder request and an authority response such as "tender conditions remain unchanged" produce no eligibility change.

### Requirement expression

The selected demo tender uses one small recursive expression tree:

```text
RuleGroup
  operator: ALL | ANY | AT_LEAST_N
  minimum_matches: integer | null
  children: RuleGroup | RuleLeaf[]

RuleLeaf
  id: string
  kind: TURNOVER_AVERAGE | CERTIFICATION | PROJECT_EXPERIENCE | EMD | DEADLINE
  hardness: HARD
  predicate: typed object
  applicability: typed condition | null
  evidence: EvidenceSpan[]
```

Only the operators and leaves required by the chosen tender are implemented. Unsupported group shapes or ambiguous prose become `UNKNOWN`.

### Narrow predicate semantics

- Turnover:
  - explicitly named financial years;
  - average aggregation only;
  - bidder legal entity only;
  - audited values only;
  - all required years must be present.
- Certification:
  - explicit certificate name;
  - explicit validity anchor such as bid deadline;
  - missing validity wording becomes `UNKNOWN`.
- Project experience:
  - value basis is `SINGLE_PROJECT`, `EACH_OF_N_PROJECTS`, or `AGGREGATE_PROJECTS`;
  - count, minimum value, completion state, and date window are explicit;
  - ambiguous "similar work" definitions require human confirmation.
- EMD:
  - exemption availability is separate from the company's exemption qualification;
  - qualification needs an explicit clause, applicability condition, and company evidence field.
- Deadline:
  - use the source timezone when stated;
  - otherwise use Asia/Kolkata and attach an uncertainty note.

## 7. Provenance and trust states

Every accepted requirement retains:

- official source URL;
- source snapshot SHA-256;
- document SHA-256 and version;
- physical PDF page number, one-based;
- printed page label when available;
- section heading or `UNKNOWN_SECTION`;
- bounded exact excerpt;
- normalized page-text hash;
- extraction model, prompt version, and schema version;
- extraction state;
- review state.

The three axes are independent:

```text
ExtractionState = PROPOSED | EVIDENCE_VERIFIED | INVALID
ReviewState     = UNREVIEWED | HUMAN_CONFIRMED | HUMAN_REJECTED | HUMAN_EDITED
Evaluation      = PASS | FAIL | UNKNOWN | NOT_APPLICABLE
```

Rules:

- The excerpt must be locatable on the declared page after whitespace normalization.
- An unlocatable excerpt makes the extraction `INVALID`.
- Only `EVIDENCE_VERIFIED`, `HUMAN_CONFIRMED`, or `HUMAN_EDITED` hard requirements may produce `PASS` or `FAIL`.
- All other hard requirements produce `UNKNOWN`.
- A materially changed clause creates a new requirement revision and resets review state.
- `NOT_APPLICABLE` requires an explicit condition or exemption; missing data never qualifies.

## 8. Processing pipeline

1. Load or trigger the selected Bright Data source snapshot.
2. Hash and persist the raw snapshot under a content-addressed filename.
3. Validate each raw row with source-specific Pydantic models.
4. Normalize valid rows into the common opportunity schema.
5. Load the pre-approved base tender and amendment from private local demo storage.
6. Verify URL allowlist, MIME signature, byte limit, page limit, and SHA-256.
7. Extract text from every text-bearing page; do not use keyword-only page exclusion.
8. Pass bounded page text to a structured-output LLM adapter with no tools, network, or credentials.
9. Validate the response with a closed Pydantic schema.
10. Locate every claimed excerpt on the declared page.
11. Build the supported Boolean requirement tree.
12. Human-confirm the single eligibility-changing amendment clause used in the demo.
13. Evaluate the synthetic contractor against the base version.
14. Apply only the effective authority change and re-evaluate against the amended version.
15. Store the precomputed extraction and assessment artifacts with content hashes for deterministic replay.

The judged path uses precomputed extraction results. A small optional live extraction action may be shown, but the demo must not depend on a live LLM request.

## 9. Deterministic decision policy

There are no numeric fit or readiness scores.

For each applicable supported hard rule:

- `FAIL`: a verified requirement is not met;
- `PASS`: a verified requirement is met;
- `UNKNOWN`: evidence, company data, authority, semantics, or review is unresolved;
- `NOT_APPLICABLE`: an explicit verified branch excludes the company.

Recommendation:

- `NO_BID`: a confirmed hard rule fails, or the tender is cancelled/closed.
- `REVIEW`: no confirmed hard failure exists, but at least one hard rule is unknown or an authority change is unresolved.
- `BID`: every applicable supported hard rule passes or is explicitly not applicable, and there is no unresolved effective amendment.

`BID` means enter the contractor's internal bid process. It never means submit a bid automatically.

## 10. User experience

### View 1: Opportunities and source proof

- six to nine opportunity rows;
- source, title, authority, deadline, and data mode;
- clear source freshness and snapshot hash;
- expandable Bright Data proof for the NTPC record;
- no opaque relevance score.

### View 2: Tender eligibility

- selected tender and company profile summary;
- fixed hard-failure or hard-unknown banner;
- four to eight requirement cards;
- company value versus tender predicate;
- evidence state, review state, page, section, and excerpt;
- link to the official source;
- `PASS`, `FAIL`, `UNKNOWN`, or `NOT_APPLICABLE` shown with text and icon, not color alone.

### View 3: Amendment impact

- document role and authority disposition;
- old authority clause and new authority clause side by side;
- old predicate/result and new predicate/result;
- explicit explanation of why the recommendation changed or stayed unchanged;
- no effective change for bidder requests rejected by the authority.

## 11. Architecture in the existing repository

### Frontend

Keep the existing Next.js 16.3.1 App Router, React 19.2.8, TypeScript strict mode, Tailwind 4, and pnpm 10.30.1.

- Pages remain Server Components for initial reads.
- One small Client Component may poll the optional source run.
- Zod validates environment variables, route/search parameters, forms, backend responses, external snapshots, and disk fixtures.
- Zod is not used for ordinary typed props or internal state.
- TanStack Query and its Devtools are intentionally omitted because the minimum slice does not need a client cache. If implementation discovers multiple independent mutations or polling workflows, adding them requires a separate design review.

### Backend

Keep Python 3.13 and uv. Add a single FastAPI process with:

- source-specific validation and normalization;
- Bright Data trigger/status/download adapter;
- content-addressed local artifact storage;
- page-aware PDF text extraction;
- structured LLM extraction adapter used by an offline preparation script;
- evidence verification;
- deterministic rule evaluation;
- four to six REST endpoints.

Use structured local JSON artifacts for the hackathon. Do not add a database until the product needs concurrent writes or multiple users.

### API surface

```text
GET  /api/v1/opportunities
GET  /api/v1/opportunities/{opportunity_id}
GET  /api/v1/opportunities/{opportunity_id}/amendment-impact
GET  /api/v1/source-proof
POST /api/v1/source-runs/ntpc
GET  /api/v1/source-runs/{run_id}
```

The last two endpoints are optional if a historical run is the only Bright Data proof. Responses include a request ID and are validated by Pydantic and frontend Zod schemas.

## 12. Security and legal boundaries

- No arbitrary user-supplied fetch URL.
- Source-domain allowlist; HTTPS only unless an approved source requires otherwise.
- Re-check redirects and resolved IPs; block private, loopback, link-local, and metadata destinations.
- Limit redirects, bytes, pages, and processing time.
- Validate PDF magic bytes and parse without executing embedded scripts or attachments.
- Treat scraped text as untrusted data.
- Give the extraction model no tools, network, credentials, or authority to calculate eligibility.
- Render no model output as raw HTML.
- Store only placeholder secret names in `.env.example`; keep `.env` ignored.
- Never retrieve or display secret values. If a later AWS deployment uses Secrets Manager, run processes through `asm-exec` and `{{resolve:secretsmanager:...}}` references.
- Keep selected tender documents private and temporary; show bounded excerpts and official links.
- Do not operate a public document mirror.
- Automated collection, retention, and commercial reuse remain `LEGAL_VERIFY` for each portal.

## 13. Evaluation and acceptance

### Dataset

- two base digital-text tender documents;
- one or two authoritative amendments;
- 20 to 30 manually verified clauses;
- six to ten hard requirements;
- one independently checked eligibility-changing clause;
- synthetic boundary and invalid-input fixtures.

Report counts, not decontextualized percentages:

- hard clauses found / hard clauses labelled;
- unsupported clauses accepted;
- correct deterministic outcomes;
- correct amendment transitions.

### Functional acceptance

- Six to nine records render across all three sources.
- One real Bright Data run can be traced from provider ID to raw hash to normalized record.
- The selected PDF set is digital-text and no more than roughly 80 pages per document.
- Every text-bearing page is examined.
- Every accepted hard rule has valid page/excerpt provenance.
- The synthetic company produces the expected base result.
- An explicit authority change produces the expected amended result.
- A rejected bidder request produces no change.
- Old and new document hashes and results remain visible.
- Snapshot and fixture labels are accurate.

### Boundary and invalid-input acceptance

- Exact turnover threshold passes; one rupee below fails.
- A missing required financial year produces `UNKNOWN`.
- A certification expiring before its explicit validity anchor fails.
- `SINGLE_PROJECT` never aggregates several projects.
- `EACH_OF_N_PROJECTS` checks every counted project.
- An EMD exemption flag without a verified applicability clause produces `UNKNOWN`.
- A bidder request rejected by the authority cannot alter an effective rule.
- A missing or mismatched excerpt invalidates the extraction.
- Scanned, corrupt, oversized, password-protected, or wrong-MIME PDFs are rejected or marked unsupported.
- Missing data never improves an evaluation to `PASS`.

### Verification commands

The implementation must pass:

```bash
(cd backend && uv run pytest)
(cd frontend && pnpm lint)
(cd frontend && pnpm exec tsc --noEmit)
(cd frontend && pnpm test)
(cd frontend && pnpm build)
(cd backend && uv run python ../tools/check_code_file_lengths.py)
```

All authored code files must remain below 200 lines. Every named application function must have a concise production-style docstring or JSDoc comment describing purpose and important input, output, side effect, or failure behavior.

## 14. Demo script

1. State the problem: discovery is useful, but missed hard clauses and amendments waste bid effort.
2. Show six to nine normalized records and their honest data-mode labels.
3. Open the NTPC Bright Data proof and trace provider run to normalized output.
4. Open the selected tender and synthetic contractor.
5. Show a source-backed hard failure or unknown with page, section, excerpt, and document hash.
6. Open the authoritative amendment.
7. Show actor, disposition, and `effective_change=true`.
8. Compare old and new clauses and deterministic results.
9. Show the recommendation transition.
10. Finish with source links, replayable snapshots, and limitations.

The entire story must complete with the network and LLM unavailable.

## 15. Remaining risks

- A selected portal may prohibit or technically block the required collector; the Phase 0 spike is a stop gate.
- The chosen amendment may be a clarification rather than an operative authority change; domain review must confirm precedence.
- Digital-text curation overstates general PDF support; the product must say so plainly.
- Complex consortium, OEM, exemption, and "similar work" clauses will often remain `UNKNOWN`.
- Document retention and commercial reuse require portal-specific legal review.
- A small curated evaluation cannot support nationwide accuracy claims.

## 16. Sources used for this specification

- [GPT-5.6 Sol model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
- [Bright Data Scraper Studio overview](https://docs.brightdata.com/datasets/scraper-studio/introduction)
- [Bright Data Collection API quickstart](https://docs.brightdata.com/datasets/scraper-studio/quickstart)
- [CPPP ePublishing](https://www.eprocure.gov.in/epublish/app)
- [CPPP portal policy](https://www.eprocure.gov.in/epublish/app?page=Disclaimer&service=page)
- [West Bengal eProcurement](https://wbtenders.gov.in/nicgep/app?page=Web)
- [NTPC Tender Portal](https://ntpctender.ntpc.co.in/)
- [Zod documentation](https://zod.dev/)
- [TanStack Query Devtools documentation](https://tanstack.com/query/latest/docs/react/devtools)
- [Next.js Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [General Financial Rules updated through 31 January 2026](https://doe.gov.in/bi-annual-compilationupdation-general-financial-rules-2017-upto-31012026general-financial-rules)
- [Digital Personal Data Protection Rules 2025](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa)
