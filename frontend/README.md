# BidRadar frontend

BidRadar is a read-only procurement decision-support interface. It renders an opportunity register, evidence-backed eligibility assessment, and authority-traced amendment impact from the frozen API v1 contract.

## Runtime

The app requires the BidRadar backend at request time. It never replaces failed backend reads with contract examples.

```bash
cp .env.example .env.local
pnpm dev
```

Set `BIDRADAR_API_BASE_URL` when the API is not available at `http://127.0.0.1:8000`.

Routes:

- `/` - validated opportunity register and source-proof state
- `/opportunities/[opportunityId]` - company profile and rule assessment
- `/opportunities/[opportunityId]/amendment` - document, authority, clause, and recommendation transition

All pages are Server Components. API payloads are parsed through closed Zod schemas before rendering. Expected transport and schema failures render explicit safe states; 404 responses use the Next.js not-found boundary.

## Validation

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

The test suite reads the four frozen `MANUAL_FIXTURE` contract examples as test inputs only. Runtime pages always fetch the configured backend dynamically.
