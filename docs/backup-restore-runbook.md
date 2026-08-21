# Backup & Restore Runbook — BidRadar

## Scope

Convex database (all tables) + file storage (documents, exports, snapshots). FastAPI stateless; no backup.

## Schedule & Retention

- Daily Convex export at 02:00 UTC via `npx convex export --path s3://bidradar-backups/<env>/<date>/` (or Convex snapshots). Triggered by `crons.ts` checkpoint.
- Retention: 30 daily, 12 monthly. Encrypted at rest, versioned, immutability 7 days.
- Checksums (SHA-256) stored alongside export; alert on mismatch.

## Backup Verification

- Automated: after export, verify manifest, table counts, file count, checksum.
- Alert `backup failure` if export missing >25h or checksum fails.

## Restore Rehearsal (quarterly)

1. Create isolated preview deployment: `npx convex deploy --preview`.
2. Import: `npx convex import --path s3://bidradar-backups/production/<date>/`.
3. Verify: row counts per table, tenant isolation query, seven-row opportunity sample, file retrieval with permission check.
4. Smoke: `pnpm build && pnpm start` against restored backend, run `smoke_demo.py`.
5. Record RTO/RPO: target RPO 24h, RTO 2h. Document in release notes.
6. Tear down preview after verification.

## Emergency Restore

1. Declare SEV1, freeze writes (disable mutations via feature flag).
2. Select latest verified snapshot (checksum OK, <24h).
3. Run `npx convex import --prod --path <snapshot> --confirm`.
4. Re-deploy Convex functions, verify `schema.ts` matches snapshot.
5. Re-enable writes, run smoke and tenant isolation tests.
6. Notify org admins; postmortem within 48h.

## File Storage Restore

- Convex files restored with database import; verify `storageId` access via permission-checked download route.
- For partial loss, re-upload from export manifest; verify SHA-256.

## Deletion & Legal Hold

- Respect `retention.ts` periods; dry-run before delete.
- Legal hold: tag organizationId to skip deletion; audit via `auditEvents`.

## Contacts & Secrets

- Backup bucket credentials via Convex env; never log. Rotate quarterly.
- Runbook owner: platform lead; rehearsal calendar invite quarterly.
