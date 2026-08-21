# Data Retention — BidRadar Full Platform

Date: 2026-08-21 · Limit: <200 lines.

## Retention periods (days, by artifact)

| Artifact | Period | Rationale |
|---|---|---|
| `sourceSnapshots` + raw bytes | 90 | provider proof + replay |
| `sourceRuns` + `opportunityVersions` | 180 | version history |
| `opportunityDocuments` storage | 90 | official docs then re-fetch |
| `documentPages`/`documentChunks` | 90 | derived, re-parseable |
| `chunkEmbeddings` vectors | 90 | re-embed from chunks |
| `companyDocuments` | 365 | evidence lifecycle |
| `exportJobs` storage (pdf/docx/csv/zip/json) | 30 | reproducible via job |
| `submissionPackages`/`submissionReceipts` | 365 | audit |
| `aiRuns`/`aiFeedback`/`evaluationCases` | 180 | model ops |
| `auditEvents` | 365 | compliance |
| `notificationEvents`/`Deliveries` | 30 | delivery dedup |
| `webhookDeliveries` | 90 | replay idempotency |
| `integrationConnections` | until org delete | credential ref |

Override via `organizationProfiles.retentionPolicy {snapshotsDays, artifactsDays}`.

## Legal hold

- Field `organizationProfiles.legalHoldUntil?: number | null`. When set and `Date.now() < holdUntil`, **all deletions skipped**.
- `retention.ts` checks `isLegalHold(ctx, orgId)` before any purge/export/delete.
- Hold placed by `org:admin` only, audited (`auditEvents` `retention.hold`), cleared with step-up.
- Dry-run reports show `legalHoldActive: true` and zero deletions.

## Dry-run before deletion

- Query `dryRunReport { orgId, counts, soonExpiring }` computes `createdAt < retentionCutoff(now, days)` per table without mutating.
- Scheduled `runRetentionCleanup` at 04:30 UTC calls dry-run first, logs structured `retention.dryRun` with hashed org, then only purges if `dryRun.purgeable >0` and no hold.
- UI shows dry-run in Settings > Retention with “Export & review” before confirm.

## Organization export

`exportOrganization` (rate-limited 2/min/org) gathers: profile, memberships, companies+evidence, sourceConnectors/runs/snapshots, opportunities/versions/docs, chunks+vectors 768-d, assessments, reviews, savedSearches/watchlists, notifications, proposals/compliance, exports (hashes), submission packages/receipts, ai runs, webhook deliveries, audit events — all tenant-filtered. Generates JSON/CSV/ZIP with manifest digest.

## Verified deletion

`verifiedDeletion` (requires step-up + org:admin, rate 2/min): 1) hold check 2) delete vectors (`chunkEmbeddings` by org), 3) `_storage` files via `storage.delete` for each `storageId`, 4) generated artifacts (`exportJobs` storage), 5) webhook destinations + `webhookDeliveries`, 6) all org tables in dependency order, 7) audit `retention.delete` + trace. Returns `{deleted: {vectors, files, artifacts, webhooks, rows}, verifyEmpty: true}` by re-query.

## Vectors, files, artifacts, webhooks

Vectors and storage are counted separately from table rows; export manifest lists every `storageId`/`embeddingId`/`destination`. Deletion verifies: vector search no results, storage fetch 404, webhook status absent, file-length gate still passes. Verified deletion handles vectors, storage files, generated artifacts, webhook deliveries and validates none remain.

## Operational notes

Retention jobs use `internalMutation` with idempotency `idempotencyKey = orgId:retention:date`. Failures emit `RATE_LIMITED`/`FORBIDDEN` safe codes. Restore rehearsal quarterly per `backup-restore-runbook.md`.
