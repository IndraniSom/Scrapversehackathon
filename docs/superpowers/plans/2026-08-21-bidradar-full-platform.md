# BidRadar Full Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the current immutable BidRadar demo into a production-grade, multi-tenant government-procurement workspace covering live opportunity discovery, company evidence, deterministic eligibility, amendment monitoring, alerts, proposal collaboration, exports, and assisted submission, with useful evidence-grounded AI throughout the workflow.

**Architecture:** Next.js is the web application, Clerk owns identity and organization membership, and Convex is the persistent realtime system of record and durable workflow coordinator. The existing FastAPI code remains the trusted Python document worker for bounded PDF/OCR processing, AI extraction, deterministic eligibility, claim verification, and export rendering; Bright Data supplies portal collection and every cross-service operation uses an idempotent job contract with source hashes and tenant-scoped authorization.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict mode, Convex, Clerk Organizations, Zod 4, Tailwind CSS 4 plus focused application CSS, Python 3.13, FastAPI, Pydantic 2, pypdf, OCRmyPDF/Tesseract behind an adapter, DeepSeek V4 through the OpenAI-compatible SDK, Sentence Transformers with `intfloat/multilingual-e5-base`, Convex full-text/vector search, Bright Data Scraper Studio, Resend, python-docx, pytest, Vitest, Testing Library, Playwright, Ruff, and OpenAPI/JSON Schema contracts.

**Spec:** `docs/superpowers/specs/2026-08-18-bidradar-hackathon-design.md` supplies the evidence, authority, deterministic-evaluation, and source-provenance invariants. This plan explicitly supersedes that document's locked product scope while preserving its trust model.

## Global Constraints

- Preserve the existing four-state rule result: `PASS | FAIL | UNKNOWN | NOT_APPLICABLE`.
- Preserve the existing recommendation result: `BID | REVIEW | NO_BID`; AI must never set it directly.
- Treat every scraped page, uploaded file, OCR result, and model response as untrusted input.
- Every AI statement shown as fact must cite a document chunk, approved company-evidence record, or verified source record.
- An AI result is always a proposal until a deterministic validator or authorized human accepts it.
- Every tenant-owned Convex table must include `organizationId` and every public function must authorize that organization before reading or writing.
- No generated or authored code file may exceed 200 lines; split by domain responsibility before reaching the limit.
- Every named application function requires a concise docstring or JSDoc explaining purpose and important input, output, side effect, or failure behavior.
- Use latest stable dependencies verified from official package registries immediately before installation; commit exact lockfiles.
- Keep TypeScript strict, reject `any`, reject unsafe casts, and validate external boundaries with Convex validators, Zod, Pydantic, or JSON Schema.
- Use test-driven implementation: failing test, observed failure, minimal implementation, passing test, focused commit.
- Do not automate CAPTCHA, Digital Signature Certificate use, portal terms acceptance, or a final government-portal submission unless that portal supplies and authorizes a supported API.
- Do not log credentials, private document contents, raw model prompts, full excerpts, access tokens, signed URLs, or company financial evidence.
- Preserve the committed offline demo as a deterministic fallback until the production path has an equally reliable seeded demonstration.
- Do not add an abstraction used only once unless it clearly creates a security or contract boundary.
- Prefer native HTML controls and tables; introduce a headless UI dependency only for an interaction that cannot be implemented accessibly and simply with native primitives.
- UI copy must be concrete procurement language. Ban vague phrases such as “AI-powered insights,” “unlock value,” “supercharge,” and “seamless intelligence.”
- UI style must avoid gradient text, decorative glassmorphism, giant hero metrics, identical card grids, excessive rounding, repeated uppercase eyebrows, and decorative page-load animation.

---

## 1. Research-backed product decisions

### 1.1 Product capabilities worth adopting

Current proposal and government-contracting products converge on several useful workflows:

- GovDash connects discovery, capture, compliance matrices, proposals, contracts, source citations, and audit trails in a shared data layer: [GovDash platform](https://www.govdash.com/platform).
- GovDash's help center exposes saved-search alerts, capability matrices, proposal outlines, compliance review, exports, and a data library: [GovDash help center](https://support.govdash.com/).
- Loopio grounds generated answers in approved content, cites sources, recommends subject-matter experts, routes reviews, and supports role-level AI permissions: [Loopio AI](https://loopio.com/platform/ai/).
- Loopio treats import, question/answer collaboration, reusable content, review, and Word/Excel/HTML export as one project workflow: [Loopio projects](https://support.loopio.com/hc/en-us/articles/360020261634-What-is-a-Project).
- GovWin emphasizes saved pursuits, added-document/deadline/status notifications, and validated opportunity changes: [GovWin notifications](https://www.deltek.com/resources/articles/govwin-real-time-notifications/).

BidRadar will adopt these workflow patterns without copying opaque win scores or unsupported analyst claims. Its differentiator remains deterministic hard eligibility, authority-gated amendment impact, and visible source lineage.

### 1.2 Platform decisions

- Use Clerk, not Convex Auth, for this Next.js production app. Convex Auth still labels Next.js SSR support experimental, while Convex documents a supported Clerk integration: [Convex and Clerk](https://docs.convex.dev/auth/clerk), [Convex Auth status](https://docs.convex.dev/auth/convex-auth).
- Use Clerk Organizations for membership, invitations, active organization, roles, and permissions: [Clerk Organizations](https://clerk.com/docs/nextjs/guides/organizations/getting-started).
- Use Convex full-text search for exact/prefix tender discovery and Convex vector search for semantic matching. Full-text search is reactive and paginated; vector search runs in actions and supports tenant/category filters: [full-text search](https://docs.convex.dev/search/text-search), [vector search](https://docs.convex.dev/search/vector-search).
- Use Convex Workflows/Workpool for durable orchestration, retries, concurrency limits, and callbacks, while passing IDs rather than document bodies between steps: [Convex workflows](https://docs.convex.dev/agents/workflows).
- Keep PDF/OCR work in FastAPI. Convex actions have a 10-minute execution ceiling and HTTP action request/response bodies are limited to 20 MB: [Convex actions](https://docs.convex.dev/functions/actions), [HTTP actions](https://docs.convex.dev/functions/http-actions).
- Use Bright Data API or webhook delivery for live and scheduled collectors while retaining raw snapshot hashes and provider IDs: [Bright Data collection and delivery](https://docs.brightdata.com/datasets/scraper-studio/initiate-collection-and-delivery-options).
- Use local multilingual embeddings from `intfloat/multilingual-e5-base` through FastAPI. The model emits 768-dimensional vectors and supports multilingual retrieval, including Hindi, Bengali, Telugu, and other languages represented in its training coverage: [model card](https://huggingface.co/intfloat/multilingual-e5-base).
- Run OCRmyPDF/Tesseract only inside the isolated worker boundary. OCRmyPDF explicitly states that its example web service has no security controls and that the tool is not designed to resist malware-bearing PDFs: [OCRmyPDF introduction and security limitations](https://ocrmypdf.readthedocs.io/en/latest/introduction.html).
- Use DeepSeek JSON mode only as a transport aid. Its documentation acknowledges occasional empty output, so Pydantic validation, bounded retries, and evidence-location checks remain mandatory: [DeepSeek JSON output](https://api-docs.deepseek.com/guides/json_mode/).
- Do not give the model submission, deletion, email-send, or arbitrary fetch tools. OWASP identifies excessive functionality, permissions, and autonomy as direct agent risks: [OWASP excessive agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/).
- Keep submission assisted. CPPP requires bidder login, DSC use, document upload, terms acceptance, and the bidder's explicit “Freeze Bid” action: [CPPP contractor guidance](https://www.eprocure.gov.in/eprocure/app?page=HelpForContractors&service=page).

## 2. Product users and permissions

| Role | Capabilities |
|---|---|
| `org:admin` | Organization settings, members, companies, integrations, retention, source connectors, all approvals |
| `org:bid_manager` | Opportunities, saved searches, company selection, assessments, proposals, assignments, export, submission package |
| `org:reviewer` | Review clauses, evidence, proposal sections, compliance matrix, and approval gates |
| `org:contributor` | Add evidence, answer assigned proposal sections, comment, update approved content drafts |
| `org:viewer` | Read opportunities, assessments, approved proposals, reports, and audit-safe summaries |

Authorization is enforced twice: Clerk protects routes and supplies identity/organization claims; Convex verifies `ctx.auth.getUserIdentity()`, active `orgId`, domain role, and resource `organizationId` before returning any record.

## 3. Complete feature inventory

### 3.1 Requested core features

- Live source collection and scheduled collection.
- Search, filters, sorting, cursor pagination, saved searches, and watchlists.
- User accounts, organizations, invitations, roles, and multiple companies.
- Company evidence uploads and structured company profiles.
- Runtime document validation, OCR, extraction, and review.
- Custom eligibility assessments for any company/opportunity pair.
- Automatic assessment attempts for every imported opportunity with a supported document.
- Corrigendum and clarification detection with authority-gated amendment impact.
- In-app, email, and digest alerts.
- CSV, JSON, PDF, DOCX, and ZIP exports.
- Proposal generation, reusable content library, assignments, review, and approvals.
- Assisted bid-submission package and official-portal handoff.
- Persistent Convex data and audit history.
- Production-grade responsive UI, accessibility, security, deployment, monitoring, backup, and recovery.

### 3.2 Helpful AI features to add

| Feature | User value | Grounding and safety gate |
|---|---|---|
| Semantic opportunity matching | Finds tenders using company capabilities rather than exact keywords | Local embeddings; return matched evidence and reasons, never a hidden score alone |
| Natural-language filter builder | Converts “cybersecurity bids in Odisha closing next month” into editable filters | Closed filter schema; no direct database query generation |
| Cited tender Q&A | Answers questions across tender documents | Only retrieved chunks from the selected tenant/tender; every paragraph cites page and document hash |
| Tender executive brief | Produces scope, dates, fees, eligibility, deliverables, and risks | Structured schema; missing facts remain unknown; reviewer can inspect every cited clause |
| Compliance matrix generator | Builds requirement, response, evidence, owner, status, and citation rows | Human review before matrix lock or proposal export |
| Capability-gap analyzer | Compares tender requirements against company evidence | Deterministic matches where possible; AI suggestions cannot turn missing evidence into PASS |
| Clause ambiguity and conflict detector | Flags contradictions, undefined terms, inconsistent dates, or likely clarification questions | Produces review candidates, not legal conclusions |
| Corrigendum impact narrator | Explains what changed and which work items are affected | Runs only after authoritative document linkage and deterministic diff |
| Deadline and task planner | Converts verified dates and deliverables into assignments and reminders | Users approve tasks; source date and timezone are always visible |
| Evidence recommender | Suggests which approved company document supports a requirement | Tenant-scoped semantic retrieval; reviewer confirms the link |
| Subject-matter expert recommender | Suggests reviewers from prior approved contributions | Explain with prior domain contributions; never infer sensitive traits |
| Content freshness reviewer | Detects approved answers that reference expired certifications, people, dates, or products | Creates review tasks; never edits approved content automatically |
| Proposal outline generator | Builds an outline that mirrors tender instructions and evaluation structure | Every heading maps to a cited instruction/evaluation clause |
| Grounded proposal drafting | Drafts sections using approved content and evidence | Citation required for factual claims; ungrounded sentences visibly marked for author input |
| Claim verifier | Finds unsupported, stale, contradictory, or over-strong claims in proposal text | Blocks approval when a mandatory factual claim has no accepted evidence |
| Review copilot | Summarizes reviewer comments and proposes a resolution checklist | Cannot resolve or dismiss comments; assigned reviewer decides |
| Scenario simulator | Shows how adding evidence or resolving an unknown would change the deterministic outcome | Clearly labeled hypothetical; never overwrites the official assessment |
| Duplicate tender clustering | Groups likely duplicates and reissues across portals | Shows similarity reasons; merging requires reviewer confirmation |
| Post-bid learning assistant | Converts outcome notes into reusable lessons and content-review tasks | Uses organization-owned outcomes only; no public claim of causation |
| Multilingual clause aid | Provides English/Hindi/regional-language working translations | Original text remains authoritative; translations are labeled machine-generated |

## 4. System architecture

```text
Browser
  ├─ Clerk authentication and active organization
  ├─ Next.js route/layout rendering
  └─ Convex reactive queries, mutations, and actions
          │
          ├─ Convex database: canonical product state
          ├─ Convex file storage: private files up to 15 MB
          ├─ Convex full-text/vector indexes
          ├─ Convex crons and durable workflows
          ├─ Bright Data actions/webhooks
          ├─ Resend actions/webhooks
          └─ FastAPI worker calls
                    ├─ bounded file retrieval
                    ├─ PDF validation and OCR
                    ├─ DeepSeek structured extraction/drafting
                    ├─ local multilingual embeddings
                    ├─ evidence verification
                    ├─ deterministic eligibility
                    ├─ amendment topology
                    ├─ claim verification
                    └─ PDF/DOCX/CSV/ZIP rendering
```

### 4.1 Ownership boundaries

- Convex owns identities mapped from Clerk, tenant data, workflow state, notifications, permissions, indexes, and all accepted/rejected review decisions.
- FastAPI owns pure or bounded processing. It cannot directly decide authorization and cannot write Convex tables without a job-scoped service credential.
- Bright Data owns collection execution but not canonical normalization or source truth.
- DeepSeek owns model inference but receives only the minimum selected page chunks or approved content required for one task.
- Deterministic business decisions remain Python domain logic and are recomputed from accepted versioned inputs.

### 4.2 Cross-service job contract

```text
JobKind =
  SOURCE_COLLECTION | DOCUMENT_PARSE | DOCUMENT_OCR | REQUIREMENT_EXTRACTION |
  EMBEDDING | ASSESSMENT | AMENDMENT_DIFF | TENDER_BRIEF | TENDER_QA |
  COMPLIANCE_MATRIX | PROPOSAL_OUTLINE | PROPOSAL_DRAFT | CLAIM_REVIEW |
  EXPORT | SUBMISSION_PACKAGE | NOTIFICATION

JobStatus =
  QUEUED | DISPATCHED | RUNNING | NEEDS_REVIEW | SUCCEEDED |
  RETRYABLE_FAILURE | FAILED | CANCELLED
```

Every job stores `organizationId`, `kind`, `status`, `idempotencyKey`, `inputRevision`, `inputHashes`, `attempt`, `maxAttempts`, `progressStage`, `safeFailureCode`, `outputRefs`, `requestedBy`, `startedAt`, `completedAt`, and `traceId`.

Workers accept only a job ID and one-time exchange token. They fetch bounded inputs through a permission-checked internal endpoint, return a closed JSON payload, and include the job ID, input revision, hashes, provider/model versions, usage, and output digest. Convex rejects stale or replayed completions.

## 5. Convex data model

### Identity and tenancy

- `users`: `clerkUserId`, display metadata, lifecycle state.
- `organizationProfiles`: `clerkOrganizationId`, slug, locale, timezone, retention policy.
- `organizationMemberships`: synchronized role/permission snapshot and webhook revision.

### Companies and evidence

- `companies`: legal identity, registrations, categories, locations, capabilities, status.
- `companyTurnover`: financial year, amount INR, audited, legal entity, evidence document.
- `companyCertifications`: name, issuer, identifiers, validity dates, evidence document.
- `companyProjects`: client, value, dates, completion state, capability tags, evidence.
- `companyExemptions`: scheme, qualification state, validity, evidence.
- `companyDocuments`: storage ID, SHA-256, MIME, size, scan state, classification, revision.

### Sources and opportunities

- `sourceConnectors`: portal, collector/version, schedule, policy review, enabled state.
- `sourceRuns`: provider ID, chronology, status, raw snapshot hash, counters, failure code.
- `sourceSnapshots`: storage ID, digest, source run, retention and provenance.
- `opportunities`: stable source identity, current version, lifecycle, canonical URL.
- `opportunityVersions`: immutable normalized version, source snapshot, content digest.
- `opportunityDocuments`: role, URL, storage ID, digest, page/text quality, authority.
- `opportunityRelationships`: duplicate, reissue, corrigendum, clarification, replacement.

### Extraction, review, and assessment

- `documentPages`: page number, printed label, normalized text hash, storage reference.
- `documentChunks`: page range, heading, text hash, bounded text, embedding reference.
- `chunkEmbeddings`: 768-float vector, organization/source filters, model revision.
- `requirementSets`: document/revision, extraction state, review state, schema version.
- `requirements`: typed predicate, hardness, applicability, evidence spans, revision.
- `reviewTasks`: target type/ID, assignee, priority, due date, state, decision.
- `assessments`: company/opportunity/requirement revision, recommendation, counts.
- `ruleResults`: assessment, rule ID, evaluation, values, explanation, evidence.
- `amendmentImpacts`: authority statement, old/new rule, transition, applied state.

### Discovery and alerts

- `savedSearches`: query, structured filters, cadence, notification channels.
- `watchlists`: opportunity, stage, owner, notes, next action.
- `notificationEvents`: typed event, deduplication key, source entity, urgency.
- `notificationDeliveries`: channel, recipient, provider ID, attempts, status.

### Proposals and submissions

- `contentEntries`: approved reusable answer, tags, evidence, owner, freshness state.
- `contentEntryRevisions`: immutable body/evidence/status revisions.
- `proposalProjects`: opportunity/company, stage, owner, dates, locked revision.
- `proposalSections`: hierarchy, instruction citation, assignee, body, state.
- `proposalComments`: thread, author, anchor, body, resolution state.
- `complianceRows`: requirement, response location, evidence, owner, status.
- `approvalGates`: target, required role, approver, decision, decision timestamp.
- `exportJobs`: format, template, source revision, output digest/storage.
- `submissionPackages`: export set, manifest, validation state, approval state.
- `submissionReceipts`: portal, acknowledgement, submittedAt, submittedBy, evidence.

### AI, operations, and learning

- `aiRuns`: feature, model, prompt/schema version, hashes, tokens, cost, outcome.
- `aiFeedback`: output ID, user decision, correction category, accepted revision.
- `evaluationCases`: dataset version, input refs, expected facts/structure/outcome.
- `integrationConnections`: provider, encrypted reference name, scopes, state.
- `webhookDeliveries`: event, destination, attempt, signature ID, status.
- `auditEvents`: actor, organization, action, target, before/after digests, trace.
- `bidOutcomes`: result, value, reason categories, notes, evidence, learned actions.

### Required indexes

- Every tenant table: `by_organization`.
- Resource lookup: `by_organization_and_id` or natural stable key.
- Opportunity list: organization/source/category/lifecycle/closesAt indexes.
- Full-text opportunity search: title/authority/reference search fields plus organization, source, category, lifecycle filter fields.
- Vector indexes: `chunkEmbeddings.by_embedding` with `organizationId`, `documentId`, `contentKind`, and `language` filters.
- Jobs: organization/status/kind/createdAt and unique idempotency key lookup.
- Notifications: organization/recipient/status/createdAt and deduplication key.
- Reviews: organization/assignee/state/dueAt.

## 6. Application routes and user journeys

```text
/
/sign-in
/onboarding
/dashboard
/opportunities
/opportunities/[opportunityId]
/opportunities/[opportunityId]/documents
/opportunities/[opportunityId]/assessment
/opportunities/[opportunityId]/amendments
/opportunities/[opportunityId]/ask
/companies
/companies/new
/companies/[companyId]
/companies/[companyId]/documents
/reviews
/saved-searches
/watchlist
/alerts
/content-library
/proposals
/proposals/[proposalId]
/proposals/[proposalId]/compliance
/proposals/[proposalId]/review
/submissions/[submissionId]
/reports
/integrations
/settings/organization
/settings/members
/settings/security
/settings/ai
```

### Primary journey

1. User joins or creates an organization.
2. User creates a company and uploads evidence.
3. Scheduled Bright Data collection imports and versions opportunities.
4. User finds a tender through keyword, filters, saved search, or semantic match.
5. System fetches and validates official documents.
6. FastAPI parses/OCRs, extracts requirements, and creates review tasks.
7. Reviewer confirms or edits evidence-bound requirements.
8. Deterministic assessment runs against the selected company.
9. New authority document triggers an amendment diff and re-assessment.
10. User moves the opportunity into the pursuit pipeline.
11. System creates a compliance matrix, proposal outline, tasks, and deadlines.
12. Contributors draft from approved content and company evidence.
13. Claim verifier and reviewers gate approval.
14. System produces exports and a validated submission package.
15. Authorized bidder submits through the official portal and records the receipt.
16. Team records the outcome and converts lessons into content-review actions.

## 7. UI and design system

### Product scene

A bid manager works on a laptop in a bright office, moving quickly between dense tender documents, company evidence, review queues, and deadlines. The interface must feel precise, calm, and operational rather than cinematic, decorative, or conversational.

### Design rules

- Restrained light theme with white content surfaces, a neutral cool-gray shell, dark ink, and one controlled green accent inherited from the current identity.
- One UI sans-serif family and one monospace stack for identifiers/hashes.
- 4/8 px spacing rhythm, 10-12 px panel radii, 44 px minimum interactive target.
- Native tables for static tabular data. Use an ARIA grid only for spreadsheet-like editing and implement the complete keyboard model.
- Persistent desktop sidebar; drawer navigation on narrow screens.
- Filter rail that becomes a modal sheet only below the tablet breakpoint.
- Document review uses a resizable two-pane layout: page/text evidence on the left, structured rule/review form on the right.
- Proposal editor uses outline navigation, section body, and evidence/review rail without nested cards.
- Decision states use icon, label, and color. Color never carries meaning alone.
- Loading uses skeletons shaped like the destination content; background jobs use persistent progress rows and status announcements.
- Empty states teach the next action: “Add a company to evaluate this tender,” not “Nothing here yet.”
- Motion is limited to 150-250 ms state transitions and must honor `prefers-reduced-motion`.
- Meet WCAG 2.2 AA for contrast, focus order, labels, status messages, target size, and keyboard access: [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

### Copy vocabulary

Use: `Opportunity`, `Source run`, `Official document`, `Requirement`, `Evidence`, `Review`, `Assessment`, `Corrigendum`, `Pursuit`, `Compliance matrix`, `Proposal`, `Submission package`.

Examples:

- “3 requirements need review.”
- “Assessment stopped because the scanned document requires OCR.”
- “Turnover evidence for FY 2023-24 is missing.”
- “The authority lowered the turnover threshold from ₹12 crore to ₹6 crore.”
- “This draft contains 2 claims without accepted evidence.”
- “Submission package is ready. Final submission must be completed on CPPP.”

## 8. Planned file structure

### Convex backend under `frontend/convex/`

```text
auth.config.ts                 Clerk JWT validation
convex.config.ts               typed environment and installed components
schema.ts                      table/index declarations only
http.ts                        Clerk, Bright Data, Resend, and worker webhooks
crons.ts                       recurring source, deadline, freshness, cleanup jobs
lib/authorization.ts           authenticated tenant and permission checks
lib/audit.ts                   append-only audit helper
lib/idempotency.ts             unique operation reservation and completion
lib/errors.ts                  safe domain errors
users.ts                       user synchronization and profile queries
organizations.ts               organization settings and member projections
companies.ts                   company CRUD and structured evidence
companyDocuments.ts            upload reservation, metadata, controlled reads
sources.ts                     connector configuration and policy state
sourceRuns.ts                  collection orchestration and result finalization
opportunities.ts               versioned opportunity writes and reads
opportunitySearch.ts           full-text/filter/pagination queries
semanticSearch.ts              embedding action and vector result hydration
documents.ts                   official document and chunk metadata
jobs.ts                        generic job creation/status/cancel/retry API
reviews.ts                     review task assignment and decisions
assessments.ts                 assessment requests and accepted result storage
amendments.ts                  authority document relationships and impacts
savedSearches.ts               saved queries and scheduled evaluation
watchlists.ts                  pursuit pipeline state
notifications.ts               event creation and in-app delivery
email.ts                       Resend action and delivery finalization
contentLibrary.ts              approved reusable content and freshness
proposals.ts                   project, outline, section, and comment state
compliance.ts                  compliance rows and approval gates
submissions.ts                 package validation, approval, and receipts
analytics.ts                   pipeline/outcome aggregates
integrations.ts                outbound webhook registrations and deliveries
ai.ts                          AI job entrypoints, quotas, and usage storage
```

### FastAPI worker additions

```text
backend/src/backend/worker_auth.py
backend/src/backend/worker_routes.py
backend/src/backend/worker_contracts.py
backend/src/backend/worker_callback.py
backend/src/backend/document_pipeline.py
backend/src/backend/ocr.py
backend/src/backend/deepseek_client.py
backend/src/backend/embeddings.py
backend/src/backend/tender_brief.py
backend/src/backend/tender_qa.py
backend/src/backend/compliance_matrix.py
backend/src/backend/proposal_outline.py
backend/src/backend/proposal_draft.py
backend/src/backend/claim_verification.py
backend/src/backend/export_docx.py
backend/src/backend/export_pdf.py
backend/src/backend/export_csv.py
backend/src/backend/submission_package.py
backend/src/backend/ai_evaluation.py
```

### Next.js application additions

```text
frontend/app/(public)/page.tsx
frontend/app/(auth)/sign-in/[[...sign-in]]/page.tsx
frontend/app/(product)/layout.tsx
frontend/app/(product)/dashboard/page.tsx
frontend/app/(product)/opportunities/page.tsx
frontend/app/(product)/opportunities/[opportunityId]/page.tsx
frontend/app/(product)/opportunities/[opportunityId]/assessment/page.tsx
frontend/app/(product)/opportunities/[opportunityId]/amendments/page.tsx
frontend/app/(product)/opportunities/[opportunityId]/ask/page.tsx
frontend/app/(product)/companies/page.tsx
frontend/app/(product)/companies/[companyId]/page.tsx
frontend/app/(product)/reviews/page.tsx
frontend/app/(product)/watchlist/page.tsx
frontend/app/(product)/alerts/page.tsx
frontend/app/(product)/content-library/page.tsx
frontend/app/(product)/proposals/[proposalId]/page.tsx
frontend/app/(product)/submissions/[submissionId]/page.tsx
frontend/app/(product)/settings/organization/page.tsx
frontend/components/app-shell/*
frontend/components/opportunities/*
frontend/components/documents/*
frontend/components/companies/*
frontend/components/reviews/*
frontend/components/proposals/*
frontend/components/submissions/*
frontend/components/ui/*
frontend/lib/convex-client-provider.tsx
frontend/lib/formatters.ts
frontend/lib/route-state.ts
frontend/lib/permissions.ts
frontend/lib/copy.ts
frontend/styles/tokens.css
frontend/styles/components.css
frontend/styles/layouts.css
```

### Shared contracts and tests

```text
contracts/worker-v1.openapi.json
contracts/worker/job-request.schema.json
contracts/worker/job-result.schema.json
contracts/worker/examples/*.json
frontend/tests/convex/*.test.ts
frontend/tests/components/*.test.tsx
frontend/e2e/*.spec.ts
backend/tests/test_worker_*.py
backend/tests/test_ai_*.py
backend/tests/test_export_*.py
backend/tests/evaluation_cases/*.json
```

## 9. Implementation tasks

### Task 1: Lock the production dependency and environment baseline

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/pnpm-lock.yaml`
- Modify: `backend/pyproject.toml`
- Modify: `backend/uv.lock`
- Modify: `frontend/.env.example`
- Modify: `backend/.env.example`
- Create: `docs/dependency-decisions.md`

**Interfaces:**
- Produces typed environment names consumed by Convex, Next.js, and FastAPI.
- Produces exact locked dependency versions for every later task.

- [ ] Verify current stable versions from official npm/PyPI pages for `convex`, `@clerk/nextjs`, `svix`, `resend`, `@convex-dev/workflow`, `@convex-dev/workpool`, `@convex-dev/rate-limiter`, `playwright`, `python-docx`, `sentence-transformers`, and the selected OCR adapter.
- [ ] Add only those dependencies and regenerate both lockfiles.
- [ ] Define public variables `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`; define server-only names for Clerk, Convex deploy, worker exchange, Bright Data, DeepSeek, Resend, and webhook secrets without values.
- [ ] Document why each dependency is required, its owner, and the removal condition.
- [ ] Run `pnpm install --frozen-lockfile`, `uv sync --frozen`, `pnpm audit --audit-level high`, and `uv run pip-audit`.
- [ ] Commit with `chore: add platform dependencies`.

### Task 2: Create the Convex schema and deployment configuration

**Files:**
- Create: `frontend/convex/schema.ts`
- Create: `frontend/convex/convex.config.ts`
- Create: `frontend/convex/crons.ts`
- Create: `frontend/convex/lib/errors.ts`
- Create: `frontend/convex/schema.test.ts`

**Interfaces:**
- Produces the tables and indexes in Section 5.
- Installs Workflow, Workpool, and Rate Limiter components.

- [ ] Write schema tests asserting every tenant table contains `organizationId` and every high-cardinality list has an indexed access path.
- [ ] Run the schema test and confirm it fails because the schema is absent.
- [ ] Define identity, company, source, opportunity, document, review, assessment, alert, proposal, AI, integration, and audit tables with closed validators.
- [ ] Define full-text and 768-dimensional vector indexes exactly as listed in Section 5.
- [ ] Configure typed environment declarations and component installation.
- [ ] Add cron definitions for source collection, deadline alerts, content freshness, delivery retries, and retention cleanup.
- [ ] Run `npx convex dev --once`, Vitest, and generated type checking.
- [ ] Commit with `feat: define convex platform schema`.

### Task 3: Implement Clerk authentication and tenant authorization

**Files:**
- Create: `frontend/convex/auth.config.ts`
- Create: `frontend/convex/lib/authorization.ts`
- Create: `frontend/convex/users.ts`
- Create: `frontend/convex/organizations.ts`
- Create: `frontend/convex/http.ts`
- Create: `frontend/lib/convex-client-provider.tsx`
- Modify: `frontend/app/layout.tsx`
- Create: `frontend/proxy.ts`
- Test: `frontend/tests/convex/authorization.test.ts`

**Interfaces:**
- Produces `requireIdentity(ctx)`, `requireOrganization(ctx)`, and `requirePermission(ctx, permission)`.
- Consumes Clerk JWT organization claims and signature-verified webhook events.

- [ ] Write tests for unauthenticated denial, inactive organization denial, cross-tenant denial, insufficient-role denial, and authorized access.
- [ ] Configure Clerk as the Convex JWT provider and protect all product routes.
- [ ] Implement authorization helpers returning `{ userId, clerkUserId, organizationId, role }`.
- [ ] Implement signature-verified user/organization/membership webhook synchronization with event-ID idempotency.
- [ ] Add Clerk and Convex providers with explicit auth-loading and auth-refresh states.
- [ ] Require step-up authentication for organization deletion, final proposal lock, and submission-package approval.
- [ ] Run focused authorization tests and a Playwright two-tenant isolation journey.
- [ ] Commit with `feat: add tenant authentication`.

### Task 4: Add append-only audit and idempotency primitives

**Files:**
- Create: `frontend/convex/lib/audit.ts`
- Create: `frontend/convex/lib/idempotency.ts`
- Create: `frontend/tests/convex/audit.test.ts`
- Create: `frontend/tests/convex/idempotency.test.ts`

**Interfaces:**
- Produces `appendAuditEvent(ctx, event)` and `reserveOperation(ctx, key)`.
- Consumed by every later mutation, webhook, notification, export, and worker callback.

- [ ] Write tests proving audit events cannot be edited through public functions and duplicate idempotency keys return the first result.
- [ ] Implement bounded metadata-only audit records using before/after digests rather than sensitive bodies.
- [ ] Implement operation reservation, completion, safe failure, and replay result retrieval.
- [ ] Ensure idempotency keys include organization, operation type, target ID, and input revision.
- [ ] Run concurrency tests with simultaneous duplicate mutations.
- [ ] Commit with `feat: add audit and idempotency controls`.

### Task 5: Build the production app shell and onboarding

**Files:**
- Create: `frontend/styles/tokens.css`
- Create: `frontend/styles/components.css`
- Create: `frontend/styles/layouts.css`
- Create: `frontend/components/app-shell/app-shell.tsx`
- Create: `frontend/components/app-shell/side-navigation.tsx`
- Create: `frontend/components/app-shell/top-context.tsx`
- Create: `frontend/app/(product)/layout.tsx`
- Create: `frontend/app/onboarding/page.tsx`
- Modify: `frontend/app/globals.css`
- Test: `frontend/tests/components/app-shell.test.tsx`

**Interfaces:**
- Produces application navigation and responsive product layout used by all product routes.
- Consumes authenticated organization and permissions.

- [ ] Write tests for active route state, permission-hidden links, mobile navigation, skip link, and keyboard focus order.
- [ ] Extract existing colors into named tokens and remove repeated uppercase eyebrow styling.
- [ ] Build a restrained shell with Opportunities, Watchlist, Companies, Reviews, Proposals, Submissions, Reports, and Settings.
- [ ] Build onboarding for organization confirmation, first company, source preferences, timezone, and alert defaults.
- [ ] Add skeleton, empty, error, offline, and permission-denied primitives.
- [ ] Verify at 320, 768, 1024, and 1440 px and with reduced motion.
- [ ] Commit with `feat: build procurement app shell`.

### Task 6: Implement multiple company profiles and structured evidence

**Files:**
- Create: `frontend/convex/companies.ts`
- Create: `frontend/app/(product)/companies/page.tsx`
- Create: `frontend/app/(product)/companies/new/page.tsx`
- Create: `frontend/app/(product)/companies/[companyId]/page.tsx`
- Create: `frontend/components/companies/company-form.tsx`
- Create: `frontend/components/companies/evidence-editor.tsx`
- Test: `frontend/tests/convex/companies.test.ts`
- Test: `frontend/tests/components/company-form.test.tsx`

**Interfaces:**
- Produces versioned company profiles compatible with the existing Python `CompanyProfile` semantics.
- Consumes organization authorization and audit primitives.

- [ ] Write tests for multiple companies, duplicate legal IDs, exact financial-year format, decimal INR amounts, validity date ordering, and tenant isolation.
- [ ] Implement company create/read/update/archive with optimistic concurrency using `revision`.
- [ ] Implement turnover, certification, project, exemption, capability, and contact editors with visible validation guidance.
- [ ] Add completeness summaries that count missing evidence without inventing a readiness score.
- [ ] Add an active assessment-company selector persisted per user and organization.
- [ ] Run unit, component, and two-company Playwright tests.
- [ ] Commit with `feat: add company evidence profiles`.

### Task 7: Implement secure private document upload and access

**Files:**
- Create: `frontend/convex/companyDocuments.ts`
- Create: `frontend/components/companies/document-uploader.tsx`
- Create: `frontend/components/documents/document-list.tsx`
- Create: `frontend/app/api/files/[documentId]/route.ts`
- Test: `frontend/tests/convex/company-documents.test.ts`
- Test: `frontend/e2e/document-upload.spec.ts`

**Interfaces:**
- Produces upload reservation, finalization, quarantine, approved, rejected, and deleted states.
- Uses Convex storage IDs without exposing durable bearer URLs directly to clients.

- [ ] Write tests for unauthorized upload URLs, spoofed MIME, wrong signature, double extension, oversize file, duplicate hash, cross-tenant read, and deleted access.
- [ ] Limit files to PDF/DOCX and 15 MB; generate storage names; preserve original name only as escaped metadata.
- [ ] Generate upload URLs only after authentication and quota checks.
- [ ] Finalize metadata only when client-reported size/type and worker-observed signature/hash agree.
- [ ] Proxy authorized downloads through a permission check; set attachment disposition and `X-Content-Type-Options: nosniff`.
- [ ] Schedule malware/document validation before a file becomes selectable evidence.
- [ ] Run OWASP-oriented upload tests and verify `.env` remains ignored.
- [ ] Commit with `feat: secure company document uploads`.

### Task 8: Productionize live and scheduled Bright Data collection

**Files:**
- Create: `frontend/convex/sources.ts`
- Create: `frontend/convex/sourceRuns.ts`
- Extend: `frontend/convex/http.ts`
- Modify: `backend/src/backend/bright_data.py`
- Modify: `scrapers/bright-data/collector.json`
- Modify: `scrapers/bright-data/interaction.js`
- Modify: `scrapers/bright-data/parser.js`
- Test: `frontend/tests/convex/source-runs.test.ts`
- Test: `backend/tests/test_scraper_parser.py`

**Interfaces:**
- Produces immutable source run and snapshot records with provider provenance.
- Consumes connector policy approval and Bright Data webhook deliveries.

- [ ] Write tests for manual trigger, cron trigger, duplicate webhook, malformed record, partial failure, rate limit, stale run, and disabled connector.
- [ ] Represent each portal connector with domain allowlist, collector/version, schedule, retention decision, and human policy review.
- [ ] Trigger published collectors through an action and store only safe request metadata.
- [ ] Verify webhook authentication, provider run ID, chronology, response bytes digest, and collector version.
- [ ] Preserve the existing three-run proof flow and recorded snapshot fallback.
- [ ] Implement retry with exponential backoff and per-connector concurrency limits.
- [ ] Run a real small NTPC collection and verify offline replay from the captured snapshot.
- [ ] Commit with `feat: add scheduled source collection`.

### Task 9: Normalize, deduplicate, and version every opportunity

**Files:**
- Create: `frontend/convex/opportunities.ts`
- Create: `frontend/convex/documents.ts`
- Modify: `backend/src/backend/source_provider.py`
- Create: `backend/src/backend/opportunity_deduplication.py`
- Test: `frontend/tests/convex/opportunity-versioning.test.ts`
- Test: `backend/tests/test_opportunity_deduplication.py`

**Interfaces:**
- Produces stable opportunities, immutable versions, and explicit relationships.
- Consumes normalized provider rows and content-addressed documents.

- [ ] Write tests for unchanged replay, changed deadline, new document, corrigendum relationship, cross-portal similarity, and false duplicate rejection.
- [ ] Define stable source key as `(source, sourceTenderId)` and immutable version digest from canonical normalized fields.
- [ ] Insert a new version only when the digest changes; never overwrite historical fields.
- [ ] Auto-link exact identity and document-hash matches; create review candidates for semantic duplicate/reissue matches.
- [ ] Queue document acquisition for every new or changed official document URL through an allowlisted fetch policy.
- [ ] Preserve `LIVE`, `RECORDED_BRIGHT_DATA_SNAPSHOT`, and `MANUAL_FIXTURE` labels in every view.
- [ ] Commit with `feat: version and deduplicate opportunities`.

### Task 10: Build search, filters, saved searches, and watchlists

**Files:**
- Create: `frontend/convex/opportunitySearch.ts`
- Create: `frontend/convex/savedSearches.ts`
- Create: `frontend/convex/watchlists.ts`
- Create: `frontend/app/(product)/opportunities/page.tsx`
- Create: `frontend/components/opportunities/filter-rail.tsx`
- Create: `frontend/components/opportunities/opportunity-table.tsx`
- Create: `frontend/components/opportunities/saved-search-dialog.tsx`
- Test: `frontend/tests/convex/opportunity-search.test.ts`
- Test: `frontend/e2e/opportunity-discovery.spec.ts`

**Interfaces:**
- Produces cursor-paginated discovery and persisted pursuit state.
- Consumes the indexes defined in Task 2.

- [ ] Write tests for keyword/prefix search, source, authority, category, location, budget, dates, lifecycle, data mode, assessment, and amendment filters.
- [ ] Encode filter state in the URL and validate it through a closed Zod schema.
- [ ] Use index-backed pagination and prevent unbounded `.collect()` calls.
- [ ] Implement saved-search CRUD with cadence and channel preferences.
- [ ] Implement watchlist stages `DISCOVERED | QUALIFYING | PURSUING | NO_BID | SUBMITTED | WON | LOST | ARCHIVED`.
- [ ] Add bulk watch/unwatch and owner assignment without turning the table into an inaccessible grid.
- [ ] Verify keyboard navigation, filter announcements, and empty states.
- [ ] Commit with `feat: add opportunity discovery`.

### Task 11: Define the Convex-FastAPI worker contract and authentication

**Files:**
- Create: `contracts/worker-v1.openapi.json`
- Create: `contracts/worker/job-request.schema.json`
- Create: `contracts/worker/job-result.schema.json`
- Create: `backend/src/backend/worker_contracts.py`
- Create: `backend/src/backend/worker_auth.py`
- Create: `backend/src/backend/worker_routes.py`
- Create: `backend/src/backend/worker_callback.py`
- Create: `frontend/convex/jobs.ts`
- Test: `backend/tests/test_worker_contracts.py`
- Test: `backend/tests/test_worker_auth.py`
- Test: `frontend/tests/convex/jobs.test.ts`

**Interfaces:**
- Produces `POST /internal/v1/jobs/{job_id}/execute` and signed result callback semantics.
- Consumes a one-time token, expected input revision, and SHA-256 list.

- [ ] Write contract examples for every `JobKind` and validate them against JSON Schema, Pydantic, and Convex validators.
- [ ] Write auth tests for expired token, replayed token, wrong audience, wrong job, wrong organization, and valid exchange.
- [ ] Implement one-time hashed exchange tokens with five-minute expiry and constant-time signature comparison.
- [ ] Implement job creation, dispatch, progress, retryable failure, permanent failure, cancellation, and stale-result rejection.
- [ ] Return safe failure codes only; store detailed sanitized diagnostics in worker logs with trace ID.
- [ ] Add readiness probes that verify configuration without fetching secret values.
- [ ] Commit with `feat: add worker job contract`.

### Task 12: Build the bounded document pipeline and OCR adapter

**Files:**
- Create: `backend/src/backend/document_pipeline.py`
- Create: `backend/src/backend/ocr.py`
- Modify: `backend/src/backend/documents.py`
- Test: `backend/tests/test_document_pipeline.py`
- Test: `backend/tests/test_ocr.py`

**Interfaces:**
- Produces `ParsedDocument | NeedsOcr | InvalidDocument` and page-level text/hash records.
- Reuses current `DocumentLimits`, `PageText`, and `ParsedDocument` models.

- [ ] Write tests for wrong magic, encrypted PDF, corrupt PDF, oversize bytes, page limit, page text limit, blank scan, OCR success, OCR timeout, and decompression/resource exhaustion.
- [ ] Keep current digital-text parsing as the first path.
- [ ] Add OCR behind an `OcrEngine` protocol and run it in an isolated process with CPU, memory, time, and page limits.
- [ ] Re-parse OCR output through the same PDF and text limits; never trust OCR output bytes.
- [ ] Store page text separately from public evidence excerpts and delete temporary files in `finally` blocks.
- [ ] Emit progress stages `DOWNLOADING | VALIDATING | OCR | PARSING | CHUNKING | COMPLETE`.
- [ ] Commit with `feat: add bounded document processing`.

### Task 13: Add runtime DeepSeek extraction with evidence verification

**Files:**
- Create: `backend/src/backend/deepseek_client.py`
- Modify: `backend/src/backend/extraction.py`
- Extend: `backend/src/backend/extraction_requests.py`
- Extend: `backend/src/backend/extraction_verification.py`
- Test: `backend/tests/test_deepseek_client.py`
- Test: `backend/tests/test_runtime_extraction.py`

**Interfaces:**
- Produces a `ProposedExtraction` followed by `VerifiedExtraction` or a closed failure.
- Consumes bounded pages and the existing extraction schemas.

- [ ] Write tests for refusal, empty content, malformed JSON, truncated JSON, extra keys, wrong page, missing excerpt, prompt injection text, timeout, rate limit, and successful extraction.
- [ ] Configure `deepseek-v4-flash` for routine extraction and `deepseek-v4-pro` only for a reviewed complex fallback.
- [ ] Use JSON mode with a complete example, deterministic temperature, bounded tokens, no tools, and no credentials in prompts.
- [ ] Retry empty/malformed transport failures within a fixed budget; never retry schema-semantic or evidence-location failures as if they were transient.
- [ ] Locate each excerpt on the declared normalized page and invalidate unlocatable evidence.
- [ ] Persist prompt/schema/model versions, page hashes, token usage, and output digest.
- [ ] Queue human review for every new material requirement revision.
- [ ] Commit with `feat: add runtime requirement extraction`.

### Task 14: Generalize deterministic assessment to all supported tenders

**Files:**
- Create: `frontend/convex/assessments.ts`
- Modify: `backend/src/backend/eligibility.py`
- Modify: `backend/src/backend/artifact_build.py`
- Create: `backend/src/backend/assessment_service.py`
- Create: `frontend/app/(product)/opportunities/[opportunityId]/assessment/page.tsx`
- Create: `frontend/components/opportunities/assessment-workspace.tsx`
- Test: `backend/tests/test_assessment_service.py`
- Test: `frontend/tests/convex/assessments.test.ts`

**Interfaces:**
- Produces immutable assessments for `(companyRevision, opportunityVersion, requirementSetRevision, asOf)`.
- Preserves `recommendation_for()` and all current predicate semantics.

- [ ] Write normal, boundary, invalid, and regression tests for turnover, certifications, projects, EMD, deadline, applicability, ALL, ANY, and AT_LEAST_N.
- [ ] Add an assessment service that accepts versioned inputs and returns the existing closed assessment view.
- [ ] Queue one assessment for every active company/opportunity pair only when the organization requests batch assessment; avoid unbounded Cartesian jobs.
- [ ] Automatically attempt an assessment for each watchlisted opportunity with a supported requirement set.
- [ ] Store unsupported or ambiguous predicates as review-blocking unknowns rather than dropping them.
- [ ] Build base/current version comparison and a scenario mode that never changes the accepted assessment.
- [ ] Commit with `feat: assess supported opportunities`.

### Task 15: Build the clause and evidence review queue

**Files:**
- Create: `frontend/convex/reviews.ts`
- Create: `frontend/app/(product)/reviews/page.tsx`
- Create: `frontend/components/reviews/review-queue.tsx`
- Create: `frontend/components/reviews/clause-review-pane.tsx`
- Create: `frontend/components/documents/page-evidence-pane.tsx`
- Test: `frontend/tests/convex/reviews.test.ts`
- Test: `frontend/e2e/clause-review.spec.ts`

**Interfaces:**
- Produces accepted/rejected/edited immutable requirement revisions and reviewer audit events.
- Consumes proposed verified extractions from Task 13.

- [ ] Write tests for assignment, reassignment, concurrent edits, stale revision, reject, edit, confirm, and permission boundaries.
- [ ] Build filters for assignee, priority, tender, state, extraction reason, and due date.
- [ ] Build synchronized page evidence and rule editor panes with bounded excerpts and source links.
- [ ] Require a reason for rejection or material edit.
- [ ] Reset review state when a material clause, predicate, document, or page hash changes.
- [ ] Re-run affected assessments after acceptance and notify only on material result changes.
- [ ] Commit with `feat: add evidence review workflow`.

### Task 16: Detect and apply amendments, clarifications, and replacements

**Files:**
- Create: `frontend/convex/amendments.ts`
- Extend: `backend/src/backend/amendments.py`
- Extend: `backend/src/backend/amendment_topology.py`
- Create: `frontend/app/(product)/opportunities/[opportunityId]/amendments/page.tsx`
- Test: `backend/tests/test_amendment_workflow.py`
- Test: `frontend/tests/convex/amendments.test.ts`

**Interfaces:**
- Produces authority statements, changed-rule revisions, affected work items, and before/after assessment links.
- Consumes versioned documents and accepted requirement sets.

- [ ] Write tests for accepted authority change, rejected bidder request, clarification without change, replacement document, cancellation, multiple changed rules, and ambiguous precedence.
- [ ] Preserve actor/disposition/effective-change gates and extend topology beyond one rule without allowing unrelated silent changes.
- [ ] Generate deterministic structural diffs before asking AI for a narrative.
- [ ] Use AI only to propose mappings between old/new clauses and to summarize accepted deterministic changes.
- [ ] Mark affected assessments, compliance rows, proposal sections, tasks, and deadlines stale.
- [ ] Notify users with exact changed clauses and next actions.
- [ ] Commit with `feat: add amendment monitoring`.

### Task 17: Add multilingual embeddings and explainable semantic matching

**Files:**
- Create: `backend/src/backend/embeddings.py`
- Create: `frontend/convex/semanticSearch.ts`
- Create: `frontend/components/opportunities/semantic-search.tsx`
- Create: `backend/tests/test_embeddings.py`
- Create: `frontend/tests/convex/semantic-search.test.ts`

**Interfaces:**
- Produces 768-dimensional normalized embeddings and tenant-filtered vector results.
- Consumes document chunks, company capability text, and `intfloat/multilingual-e5-base`.

- [ ] Write tests for deterministic dimension, empty input, overlong input, tenant filter, deleted chunk, language variants, and retrieval relevance fixtures.
- [ ] Encode documents with `passage:` and queries with `query:` according to the model card.
- [ ] Store embeddings separately from domain records and pin model/revision metadata.
- [ ] Combine lexical and vector candidates, then display matching capabilities, clauses, and source excerpts rather than one opaque score.
- [ ] Add natural-language filter parsing into a closed `OpportunityFilters` schema; show the parsed chips before executing.
- [ ] Measure recall@10 and citation precision on a manually labeled tender/capability set before enabling semantic matching by default.
- [ ] Commit with `feat: add semantic opportunity matching`.

### Task 18: Add cited tender Q&A, executive briefs, and working translations

**Files:**
- Create: `backend/src/backend/tender_qa.py`
- Create: `backend/src/backend/tender_brief.py`
- Create: `backend/src/backend/tender_translation.py`
- Create: `frontend/app/(product)/opportunities/[opportunityId]/ask/page.tsx`
- Create: `frontend/components/opportunities/tender-qa.tsx`
- Create: `frontend/components/opportunities/executive-brief.tsx`
- Create: `frontend/components/opportunities/working-translation.tsx`
- Test: `backend/tests/test_tender_qa.py`
- Test: `backend/tests/test_tender_brief.py`
- Test: `backend/tests/test_tender_translation.py`

**Interfaces:**
- Produces answer paragraphs with cited chunk/page/document IDs and a closed brief schema.
- Consumes tenant-filtered retrieval results only.

- [ ] Write tests for answerable question, unanswerable question, conflicting clauses, wrong-tenant retrieval, prompt injection in a document, and missing citation.
- [ ] Retrieve top lexical/vector chunks and include adjacent context without crossing document permissions.
- [ ] Require citations for each factual paragraph; reject output referencing chunks not supplied to the model.
- [ ] Build a brief with scope, authority, dates, fees, hard requirements, deliverables, submission instructions, amendments, uncertainties, and review state.
- [ ] Add “Not established by the reviewed documents” as the only acceptable unsupported answer.
- [ ] Add English/Hindi/regional-language working translations that preserve paragraph-to-source anchors, display original text beside translated text, and label every translation as non-authoritative machine output.
- [ ] Reject translation output that drops numbers, dates, currency, reference identifiers, or paragraph anchors; route rejected output to review rather than displaying it.
- [ ] Rate-limit questions and track model/token/cost usage per organization.
- [ ] Commit with `feat: add cited tender intelligence`.

### Task 19: Generate compliance matrices and capability-gap reviews

**Files:**
- Create: `backend/src/backend/compliance_matrix.py`
- Create: `frontend/convex/compliance.ts`
- Create: `frontend/components/proposals/compliance-matrix.tsx`
- Create: `frontend/app/(product)/proposals/[proposalId]/compliance/page.tsx`
- Test: `backend/tests/test_compliance_matrix.py`
- Test: `frontend/tests/convex/compliance.test.ts`

**Interfaces:**
- Produces rows with requirement citation, response location, evidence, owner, status, and review state.
- Consumes accepted requirements and company evidence.

- [ ] Write tests for complete matrix, missing response, missing evidence, conflicting requirements, duplicate clause, stale amendment, and cross-tenant evidence.
- [ ] Deterministically seed matrix rows from accepted requirements before AI suggests grouping or response placement.
- [ ] Add gap categories `MISSING_DATA | MISSING_DOCUMENT | FAILED_REQUIREMENT | UNKNOWN_SEMANTICS | OWNER_REQUIRED | REVIEW_REQUIRED`.
- [ ] Add AI ambiguity/conflict candidates with exact paired citations and reviewer disposition.
- [ ] Prevent proposal approval while mandatory matrix rows lack an accepted response/evidence state.
- [ ] Export the matrix to CSV and include it in the submission package.
- [ ] Commit with `feat: add compliance and gap analysis`.

### Task 20: Implement alerts, deadlines, and AI task planning

**Files:**
- Create: `frontend/convex/notifications.ts`
- Create: `frontend/convex/email.ts`
- Create: `frontend/app/(product)/alerts/page.tsx`
- Create: `frontend/components/app-shell/notification-center.tsx`
- Create: `backend/src/backend/deadline_tasks.py`
- Test: `frontend/tests/convex/notifications.test.ts`
- Test: `backend/tests/test_deadline_tasks.py`

**Interfaces:**
- Produces in-app/email notifications and user-approved tasks from cited dates/deliverables.
- Consumes saved searches, source changes, reviews, amendments, and proposal milestones.

- [ ] Write tests for duplicate event, channel preference, quiet hours, digest grouping, retry, deadline timezone, changed deadline, and disabled recipient.
- [ ] Define event types for saved-search match, new document, amendment, deadline, assessment transition, assignment, comment mention, approval, export, and submission risk.
- [ ] Use Resend idempotency keys and verify delivery webhooks.
- [ ] Extract task suggestions only from verified dates/deliverables and require user approval before assignment.
- [ ] Provide `.ics` calendar export and per-user reminder offsets.
- [ ] Announce realtime status updates using an accessible `role=status` region.
- [ ] Commit with `feat: add procurement alerts`.

### Task 21: Build the approved content library and freshness review

**Files:**
- Create: `frontend/convex/contentLibrary.ts`
- Create: `frontend/app/(product)/content-library/page.tsx`
- Create: `frontend/components/proposals/content-library.tsx`
- Create: `backend/src/backend/content_freshness.py`
- Test: `frontend/tests/convex/content-library.test.ts`
- Test: `backend/tests/test_content_freshness.py`

**Interfaces:**
- Produces approved, permission-scoped reusable content with immutable revisions and evidence.
- Consumes company documents, proposal approvals, and semantic embeddings.

- [ ] Write tests for draft/review/approved/expired states, duplicate entry, permission filtering, stale evidence, and revision rollback.
- [ ] Support categories, tags, capability areas, owner, review cadence, citations, attachments, and usage history.
- [ ] Suggest near-duplicate entries through vector search; require user selection before merging.
- [ ] Detect expired dates/certifications, changed people/products, unsupported claims, and old evidence; create review tasks without editing approved text.
- [ ] Suggest subject-matter experts using prior accepted contributions in the same capability category and explain the recommendation.
- [ ] Allow approved proposal sections to be proposed back into the library through a separate review.
- [ ] Commit with `feat: add approved content library`.

### Task 22: Build proposal projects, outline generation, and collaboration

**Files:**
- Create: `frontend/convex/proposals.ts`
- Create: `backend/src/backend/proposal_outline.py`
- Create: `frontend/app/(product)/proposals/page.tsx`
- Create: `frontend/app/(product)/proposals/[proposalId]/page.tsx`
- Create: `frontend/components/proposals/proposal-workspace.tsx`
- Create: `frontend/components/proposals/outline-navigation.tsx`
- Create: `frontend/components/proposals/section-editor.tsx`
- Test: `backend/tests/test_proposal_outline.py`
- Test: `frontend/tests/convex/proposals.test.ts`

**Interfaces:**
- Produces versioned proposal outlines/sections, assignments, comments, and approval state.
- Consumes opportunity instructions, compliance rows, approved content, and company evidence.

- [ ] Write tests for project creation, outline hierarchy, assignment, comment anchor, concurrent revision conflict, lock, unlock authorization, and amendment invalidation.
- [ ] Generate outline candidates from cited instruction/evaluation clauses and require bid-manager approval.
- [ ] Build section states `NOT_STARTED | DRAFTING | READY_FOR_REVIEW | CHANGES_REQUESTED | APPROVED | LOCKED`.
- [ ] Add comments, mentions, assignees, due dates, word/page targets, and evidence attachments.
- [ ] Prevent edits to locked revisions and preserve all previous accepted versions.
- [ ] Add progress based on explicit section states and compliance rows, not an AI-generated percentage.
- [ ] Commit with `feat: add proposal collaboration`.

### Task 23: Add grounded drafting, claim verification, and review copilot

**Files:**
- Create: `backend/src/backend/proposal_draft.py`
- Create: `backend/src/backend/claim_verification.py`
- Create: `backend/src/backend/review_copilot.py`
- Create: `frontend/convex/ai.ts`
- Create: `frontend/components/proposals/draft-assistant.tsx`
- Create: `frontend/components/proposals/claim-review.tsx`
- Test: `backend/tests/test_proposal_draft.py`
- Test: `backend/tests/test_claim_verification.py`

**Interfaces:**
- Produces cited draft blocks, claim-level support results, and unresolved-review checklists.
- Consumes only approved content, selected evidence, tender chunks, and explicit section instructions.

- [ ] Write tests for grounded draft, missing source, cross-tenant retrieval, prompt injection, fabricated number, stale certificate, contradictory claim, and reviewer correction.
- [ ] Require each generated factual block to declare source IDs; verify every source exists, is authorized, and entails the bounded claim.
- [ ] Mark unsupported text as `AUTHOR_INPUT_REQUIRED` instead of filling it creatively.
- [ ] Run claim verification before `READY_FOR_REVIEW` and again before approval/export.
- [ ] Summarize reviewer comments into a checklist without resolving, dismissing, or changing comment states.
- [ ] Store model/prompt/retrieval hashes, token usage, accepted/rejected feedback, and corrected revision.
- [ ] Commit with `feat: add grounded proposal assistance`.

### Task 24: Add scenario simulation and post-bid learning

**Files:**
- Create: `frontend/convex/analytics.ts`
- Create: `backend/src/backend/scenario_simulation.py`
- Create: `backend/src/backend/post_bid_learning.py`
- Create: `frontend/app/(product)/reports/page.tsx`
- Create: `frontend/components/opportunities/scenario-simulator.tsx`
- Test: `backend/tests/test_scenario_simulation.py`
- Test: `frontend/tests/convex/analytics.test.ts`

**Interfaces:**
- Produces hypothetical deterministic assessments and organization-owned outcome insights.
- Consumes versioned assessment inputs, pursuit stages, proposal activity, and recorded outcomes.

- [ ] Write tests proving simulations never mutate accepted assessments and are labeled hypothetical in API/UI/export.
- [ ] Let users add a temporary evidence value, resolve an unknown, or select an amendment version and recompute the deterministic result.
- [ ] Record won/lost/no-submit outcomes with structured reason categories and optional evidence.
- [ ] Generate post-bid suggestions for content reviews, missing evidence, process bottlenecks, and saved-search tuning.
- [ ] Show counts and timelines with minimum sample disclosure; do not claim win causation or predictive accuracy from sparse data.
- [ ] Add data export/deletion for analytics and outcome records.
- [ ] Commit with `feat: add bid learning tools`.

### Task 25: Generate professional exports and submission packages

**Files:**
- Create: `backend/src/backend/export_docx.py`
- Create: `backend/src/backend/export_pdf.py`
- Create: `backend/src/backend/export_csv.py`
- Create: `backend/src/backend/submission_package.py`
- Create: `frontend/convex/submissions.ts`
- Create: `frontend/app/(product)/submissions/[submissionId]/page.tsx`
- Test: `backend/tests/test_export_docx.py`
- Test: `backend/tests/test_submission_package.py`

**Interfaces:**
- Produces content-addressed PDF/DOCX/CSV/JSON/ZIP artifacts from locked revisions.
- Consumes approved assessments, compliance rows, proposal sections, and company evidence.

- [ ] Write tests for deterministic order, template style, Unicode/INR text, table overflow, missing evidence, stale amendment, unapproved section, digest mismatch, and ZIP path traversal.
- [ ] Render assessment PDF, compliance CSV, proposal DOCX, evidence manifest JSON, and complete ZIP package.
- [ ] Use document styles rather than direct formatting for DOCX output and include headers, footers, page numbering, contents, citations, and revision metadata.
- [ ] Reject package generation if mandatory approvals, current amendment review, or required evidence are missing.
- [ ] Include SHA-256, byte length, MIME, origin, and proposal revision for every file in the manifest.
- [ ] Visually render and inspect PDF/DOCX outputs in tests before declaring completion.
- [ ] Commit with `feat: generate submission packages`.

### Task 26: Implement assisted submission and authorized connector boundary

**Files:**
- Create: `frontend/convex/integrations.ts`
- Create: `frontend/components/submissions/submission-checklist.tsx`
- Create: `frontend/components/submissions/receipt-form.tsx`
- Create: `frontend/app/(product)/integrations/page.tsx`
- Test: `frontend/tests/convex/submissions.test.ts`
- Test: `frontend/e2e/submission-handoff.spec.ts`

**Interfaces:**
- Produces a reviewed handoff, acknowledgement record, and an interface for future portal-authorized connectors.
- Never supplies credentials or DSC access to AI or generic automation.

- [ ] Write tests for incomplete checklist, stale package, missing step-up auth, duplicate receipt, unauthorized connector, and approved handoff.
- [ ] Present portal-specific checklist, official link, server-clock warning, required covers, filenames, EMD, and signing instructions.
- [ ] Require bid-manager approval and recent reverification before package download/final handoff.
- [ ] Let the bidder record acknowledgement number, portal timestamp, submitted package digest, and receipt evidence.
- [ ] Define `SubmissionConnector.prepare()` and `SubmissionConnector.status()` only; add `submit()` solely in a portal-specific plan backed by written API authorization.
- [ ] Audit every transition and prevent AI from changing submission state.
- [ ] Commit with `feat: add assisted bid submission`.

### Task 27: Add outbound webhooks and integration APIs

**Files:**
- Extend: `frontend/convex/integrations.ts`
- Extend: `frontend/convex/http.ts`
- Create: `frontend/app/(product)/settings/integrations/page.tsx`
- Create: `contracts/public-webhooks-v1.json`
- Test: `frontend/tests/convex/integrations.test.ts`

**Interfaces:**
- Produces signed outbound events for opportunity, assessment, amendment, review, proposal, and submission changes.
- Consumes tenant-owned webhook endpoints and event subscriptions.

- [ ] Write tests for signature, replay, disabled endpoint, retry, backoff, dead letter, secret rotation, and tenant isolation.
- [ ] Define versioned webhook envelopes with event ID, organization ID, type, occurredAt, data ID, revision, and trace ID.
- [ ] Sign bodies with timestamped HMAC and document verification examples without revealing secrets.
- [ ] Add endpoint verification and SSRF protection: HTTPS allowlist policy, DNS/IP checks, redirect revalidation, private/metadata-network block, and bounded response.
- [ ] Add API-key management only for organization admins with hashed token storage and revocation.
- [ ] Export calendar `.ics` and generic CSV/JSON before adding vendor-specific CRM/chat connectors.
- [ ] Commit with `feat: add integration webhooks`.

### Task 28: Add AI governance, evaluation, rate limits, and cost controls

**Files:**
- Create: `backend/src/backend/ai_evaluation.py`
- Create: `backend/tests/evaluation_cases/*.json`
- Extend: `frontend/convex/ai.ts`
- Create: `frontend/app/(product)/settings/ai/page.tsx`
- Create: `docs/ai-governance.md`
- Test: `backend/tests/test_ai_evaluation.py`
- Test: `frontend/tests/convex/ai-usage.test.ts`

**Interfaces:**
- Produces feature-level AI enablement, budgets, evaluation gates, and usage reports.
- Consumes model metadata and user feedback from all AI jobs.

- [ ] Build labeled evaluation sets for requirement extraction, citations, Q&A abstention, compliance rows, proposal claims, and amendment mapping.
- [ ] Measure exact schema validity, citation precision, citation recall, excerpt location, unsupported-claim rate, abstention correctness, latency, and cost.
- [ ] Require zero accepted unsupported hard clauses and zero cross-tenant retrievals before production enablement.
- [ ] Add per-user, per-organization, and global request/token rate limits with reactive retry timing.
- [ ] Track input/output/cache-hit/cache-miss tokens and cost by feature without storing sensitive prompts.
- [ ] Add admin controls to disable each AI feature and choose approved models.
- [ ] Document human roles, known limits, evaluation cadence, incident response, and rollback in line with the [NIST AI RMF](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/).
- [ ] Commit with `feat: govern and evaluate ai features`.

### Task 29: Harden security, privacy, retention, and abuse controls

**Files:**
- Create: `docs/threat-model.md`
- Create: `docs/data-retention.md`
- Create: `frontend/convex/retention.ts`
- Modify: `frontend/next.config.ts`
- Modify: `backend/src/backend/main.py`
- Test: `frontend/e2e/security-boundaries.spec.ts`
- Test: `backend/tests/test_worker_security.py`

**Interfaces:**
- Produces enforceable retention, deletion, headers, rate limits, and threat mitigations.
- Applies to every earlier feature.

- [ ] Threat-model authentication, tenant isolation, uploads, SSRF, parser exploits, webhook spoofing, prompt injection, RAG poisoning, excessive agency, export leakage, and submission misuse.
- [ ] Add CSP, HSTS, frame protection, MIME sniffing protection, referrer policy, permissions policy, and narrow CORS.
- [ ] Add per-route and per-organization abuse limits for uploads, search, AI, exports, and webhooks.
- [ ] Define retention periods by artifact type and legal hold; implement dry-run reports before deletion.
- [ ] Implement organization export and verified deletion, including vectors, storage files, generated artifacts, and webhook destinations.
- [ ] Add dependency, secret, IaC/container, and SAST scans to CI.
- [ ] Run a skeptical security review and record reproducible findings before fixes.
- [ ] Commit with `feat: harden platform security`.

### Task 30: Add observability, backups, deployment, and operational runbooks

**Files:**
- Create: `frontend/instrumentation.ts`
- Create: `backend/src/backend/observability.py`
- Create: `docs/production-deployment.md`
- Create: `docs/incident-runbook.md`
- Create: `docs/backup-restore-runbook.md`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Produces trace correlation across browser, Next.js, Convex, Bright Data, FastAPI, DeepSeek, Resend, and exports.
- Produces staged deployment and tested restore procedures.

- [ ] Define structured log fields: timestamp, environment, service, trace ID, organization hash, user hash, job ID, action, status, duration, safe error code.
- [ ] Instrument Next.js request errors, Convex logs, FastAPI requests/jobs, provider calls, and model usage.
- [ ] Configure development, preview, staging, and production environments with separate credentials and datasets.
- [ ] Configure scheduled Convex database/file backups and perform a documented restore rehearsal.
- [ ] Containerize FastAPI with a non-root user, read-only filesystem where practical, health probes, and bounded worker concurrency.
- [ ] Deploy Next.js, Convex, and FastAPI only after CI passes; run production smoke checks and automatic rollback on failure.
- [ ] Add alerts for failed source schedules, job backlog, elevated failure rate, deadline delivery failure, model cost, storage growth, and backup failure.
- [ ] Commit with `ops: add production deployment controls`.

### Task 31: Complete accessibility, performance, and production UI polish

**Files:**
- Modify: all product pages and components created by Tasks 5-27
- Create: `frontend/e2e/accessibility.spec.ts`
- Create: `frontend/e2e/responsive.spec.ts`
- Create: `frontend/e2e/keyboard.spec.ts`
- Create: `docs/ui-quality-checklist.md`

**Interfaces:**
- Produces the final consistent UI behavior across all routes.
- Consumes the design rules in Section 7.

- [ ] Test every route at 320, 768, 1024, and 1440 px with long titles, empty data, loading, error, and maximum realistic records.
- [ ] Verify keyboard-only navigation, focus restoration, dialogs, table sorting, filter changes, editor actions, and background-job announcements.
- [ ] Verify WCAG 2.2 AA contrast, target size, labels, errors, focus visibility/order, status messages, landmarks, headings, and reduced motion.
- [ ] Replace spinners with destination-shaped skeletons and remove decorative motion.
- [ ] Enforce consistent button, field, badge, table, panel, dialog, and empty-state vocabulary.
- [ ] Run Lighthouse on production builds and keep critical product routes within agreed performance budgets: LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤ 200 ms on the standard test profile.
- [ ] Run the AI-slop review: remove generic copy, excessive cards, gradients, glass, fake metrics, and repetitive eyebrows.
- [ ] Commit with `fix: polish production experience`.

### Task 32: Build end-to-end acceptance, demo, and release evidence

**Files:**
- Create: `frontend/e2e/full-bid-lifecycle.spec.ts`
- Create: `tools/seed_production_demo.py`
- Create: `tools/smoke_platform.py`
- Update: `docs/release-runbook.md`
- Update: `docs/release-review.md`
- Update: `docs/release-security.md`
- Create: `docs/demo-script.md`

**Interfaces:**
- Produces a reproducible full lifecycle and release evidence ledger.
- Consumes all previous tasks.

- [ ] Seed two organizations, three companies, multiple sources, at least twelve opportunities, one live source proof, three document-quality states, two amendments, and one complete proposal without embedding secrets.
- [ ] Test sign-in, organization isolation, company upload, source run, discovery, extraction, review, assessment, amendment, alert, proposal, claim review, export, submission handoff, receipt, and outcome.
- [ ] Test provider failures and prove the offline snapshot/demo remains functional.
- [ ] Run backend tests, frontend tests, type checker, linter, production build, Playwright, contract validation, file-length check, dependency audits, secret scan, and smoke suite.
- [ ] Review the final diff for duplication, unsafe types, swallowed errors, resource leaks, stale documentation, and code files over 200 lines.
- [ ] Rehearse a judge-facing script showing one real collection, one eligibility decision, one amendment transition, one cited AI feature, one proposal/compliance flow, and one submission package.
- [ ] Commit with `test: prove full bid lifecycle`.

## 10. Required validation commands

```bash
(cd frontend && pnpm install --frozen-lockfile)
(cd frontend && pnpm test)
(cd frontend && pnpm lint)
(cd frontend && pnpm typecheck)
(cd frontend && pnpm build)
(cd frontend && pnpm exec playwright test)
(cd frontend && npx convex dev --once)
(cd backend && uv sync --frozen)
(cd backend && uv run pytest -q)
(cd backend && uv run ruff check src tests scripts)
(cd backend && uv run pip-audit)
(cd frontend && pnpm audit --audit-level high)
uv run python tools/check_sensitive_patterns.py
uv run python tools/check_code_file_lengths.py
uv run python tools/validate_contract.py
uv run python tools/smoke_platform.py
```

Completion requires every command to pass. If a third-party live check is unavailable, the release report must name that unavailable check and show the recorded replay that was used instead.

## 11. Acceptance criteria by capability

### Identity and tenancy

- Users can belong to multiple organizations and switch active organization.
- Roles restrict routes and backend operations.
- Cross-tenant queries, document access, vector retrieval, worker completion, and exports are denied and tested.

### Ingestion and discovery

- At least one collector runs live and all configured collectors support schedules and recorded replay.
- Every opportunity exposes source, version, data mode, collection proof, and document lineage.
- Search/filter/sort/pagination, saved searches, watchlists, and alerts operate on persistent data.

### Documents and assessments

- Digital PDFs, OCR candidates, invalid files, and unsupported semantics have explicit states.
- Every accepted rule includes locatable evidence and review state.
- Every supported watchlisted tender can be assessed against any selected company.
- Missing or ambiguous data never improves an outcome.
- Amendments invalidate and recompute affected results only after authority/review gates.

### AI

- Semantic matching explains which capability/evidence/requirement caused the match.
- Q&A and briefs cite authorized source chunks and abstain when support is absent.
- AI extraction, matrices, outlines, drafts, task suggestions, and translations remain reviewable proposals.
- No AI feature can submit a bid, delete records, send arbitrary messages, fetch arbitrary URLs, approve a review, or change a deterministic recommendation.
- Evaluation datasets and usage/cost records exist for every production-enabled AI feature.

### Proposals and submission

- Teams can create an outline, assign sections, comment, review, approve, and lock a revision.
- Compliance rows bind requirements to response sections and evidence.
- Claim verification blocks unsupported mandatory facts.
- PDF, DOCX, CSV, JSON, and ZIP exports include hashes and revision identity.
- Submission handoff requires approval and step-up authentication; receipts are immutable and auditable.

### Production quality

- CI, staging, backup/restore, monitoring, rate limits, incident response, retention, and deletion are documented and tested.
- Product routes meet accessibility and performance budgets.
- No authored code file exceeds 200 lines and every function has required documentation.
- No high/critical dependency issue, hardcoded secret, tenant-isolation failure, or reportable security finding remains open at release.

## 12. Rollout order

1. Foundation: Tasks 1-5.
2. Persistent company evidence: Tasks 6-7.
3. Live source system and discovery: Tasks 8-10.
4. Worker and document intelligence: Tasks 11-13.
5. Eligibility, reviews, and amendments: Tasks 14-16.
6. Search and cited AI intelligence: Tasks 17-18.
7. Capture, alerts, and knowledge: Tasks 19-21.
8. Proposal and AI quality: Tasks 22-24.
9. Export, submission, and integrations: Tasks 25-27.
10. Governance, security, operations, and release: Tasks 28-32.

Each rollout group must be releasable and testable on its own. Do not start a later group while an earlier group's tenant-isolation, contract, or security gates are failing.

## 13. Risks and explicit mitigations

- Portal change or blocking: collector-specific contracts, policy review, snapshots, failure alerts, and no CAPTCHA circumvention.
- Scraped false data: raw snapshot retention, normalization validation, version history, and visible data mode.
- Malicious uploads: allowlist, signature, size/page/time limits, isolation, malware scan, and controlled download.
- Prompt injection: treat document text as data, give extraction no tools, tenant-filter retrieval, validate output, cite inputs, and require review.
- AI hallucination: closed schemas, evidence location, claim verifier, abstention, deterministic decisions, and evaluation gates.
- Cross-tenant leakage: mandatory organization indexes/filters, centralized authorization, security tests, and job-scoped exchange tokens.
- Duplicate side effects: idempotency keys, Workflow/Workpool, provider delivery IDs, and immutable result revisions.
- Stale amendments: versioned documents, relationship review, downstream invalidation, and explicit stale UI.
- Submission liability: assisted package/handoff, step-up auth, human approval, portal acknowledgement, no autonomous final submission.
- Cost spikes: per-feature token tracking, per-user/org/global rate limits, model routing, usage thresholds, and admin kill switches.
- Complex UI: shared primitives, consistent vocabulary, native controls, progressive disclosure, and task-based usability testing.

## 14. Execution handoff

Create a feature branch named `bidradar-full-platform` when implementation begins. Execute tasks in rollout order with a focused review after every task and a security review after every rollout group. The recommended execution mode is subagent-driven development with one implementer per task and independent spec/code review before moving forward.
