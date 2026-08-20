# Dependency decisions — BidRadar full platform

> Verified 2026-08-21 against npm and PyPI registries. Pin exact versions and commit lockfiles.

## Frontend (Next.js 16 App Router)

| Package | Version | Owner | Purpose | Removal condition |
|---|---|---|---|---|
| `next` | 16.3.1 | Vercel | App Router, SSR, middleware `proxy.ts` | Replacing framework |
| `react` / `react-dom` | 19.2.8 | Meta | UI | Framework change |
| `convex` | 1.44.0 | Convex | Database, storage, search, crons, workflows | Replacing system of record |
| `@clerk/nextjs` | 7.7.9 | Clerk | Identity, Organization, JWT for Convex auth | Replacing auth provider |
| `@convex-dev/workflow` | 0.4.6 | Convex | Durable workflow orchestration | No long-running jobs |
| `@convex-dev/workpool` | 0.4.9 | Convex | Concurrency-limited durable work pool | No bounded worker jobs |
| `@convex-dev/rate-limiter` | 0.3.2 | Convex | Per-user/org/global token rate limiting | No AI cost controls |
| `svix` | 2.0.0 | Svix | Verify Clerk/Bright Data/Resend webhooks (HMAC) | Webhooks removed |
| `resend` | 6.18.0 | Resend | Transactional email and delivery webhooks | Email removed — pinned to 6.18.0 (latest trusted provenance before no-downgrade loss at 6.18.1–6.21.0) |
| `zod` | 4.4.3 | Zod | Closed validation at TS boundaries | Replacing validator |
| `tailwindcss` / `@tailwindcss/postcss` | 4.3.3 | Tailwind Labs | Utility CSS | Design system change |
| `@playwright/test` | 1.62.1 | Microsoft | E2E (two-tenant isolation, lifecycle) | No browser E2E |
| `vitest` / `@testing-library/*` / `jsdom` | 4.1.11 / 16.3.2 | Vitest/Testing Library | Unit + component tests | Replacing test runner |

## Backend (Python 3.13, FastAPI)

| Package | Version | Owner | Purpose | Removal condition |
|---|---|---|---|---|
| `fastapi` | 0.141.1 | FastAPI | Bounded document worker HTTP surface | Replacing Python service |
| `uvicorn` | 0.52.4 | Uvicorn | ASGI server | Server change |
| `pydantic` / `pydantic-settings` | 2.13.4 / 2.15.0 | Pydantic | Strict schemas, env Settings | Replacing validation |
| `pypdf` | 6.16.1 | pypdf | Digital-text PDF parsing within DocumentLimits | PDF parsing removed |
| `python-docx` | 1.2.0 | python-openxml | DOCX export with styles, headers, TOC | DOCX export removed |
| `sentence-transformers` | 6.0.0 | UKP Lab / HF | Local `intfloat/multilingual-e5-base` 768-d embeddings | Semantic search removed |
| `httpx` | 0.28.1 | Encode | Outbound HTTP (Bright Data, Convex callback) | No outbound calls |
| `openai` | 3.3.1 | OpenAI | DeepSeek V4 via OpenAI-compatible SDK (JSON mode) | Extraction removed |

### OCR adapter

`ocrmypdf` + `tesseract` were evaluated (latest 17.10.0). Per plan §1.2 and OCRmyPDF docs, OCR must run only inside the isolated worker boundary (no security-hardened web service). Install `ocrmypdf` via system package manager when the isolated worker image is built; do not add it to `pyproject.toml` until the worker container enables the adapter, to avoid pulling heavy ghostscript/tesseract deps into local dev without isolation. Track as deferred: `ocrmypdf==17.10.0` with `OCR_ENGINE=tesseract` behind `OcrEngine` protocol.

## Verification

```bash
pnpm view convex version        # 1.44.0
pnpm view @clerk/nextjs version # 7.7.9
pnpm view svix version         # 2.0.0
pnpm view resend version       # 6.21.0
pnpm view @convex-dev/workflow version   # 0.4.6
pnpm view @convex-dev/workpool version   # 0.4.9
pnpm view @convex-dev/rate-limiter version # 0.3.2
pnpm view @playwright/test version       # 1.62.1
pip index versions python-docx            # 1.2.0
pip index versions sentence-transformers  # 6.0.0
pip index versions ocrmypdf               # 17.10.0
```

Owner review each release; bump only after verifying breaking changes in upstream CHANGELOG and running `pnpm audit --audit-level high` and `pip-audit`.
