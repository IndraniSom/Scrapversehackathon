# Production Deployment — BidRadar

Environments: `development`, `preview`, `staging`, `production`. Each has isolated Convex deployment, Vercel project, FastAPI service, and secrets.

## Preconditions

- CI passes on `bidradar-full-platform` branch.
- Secrets never committed; injected via Vercel/Convex/Fly env.
- Convex schema hash and frozen API contract verified before deploy.

## Containerization

- Dockerfile at `backend/Dockerfile`: `python:3.13-slim`, non-root `app` user (UID 10001), `WORKDIR /app`, `COPY --chown=app`, read-only root FS, `tmpfs` on `/tmp`, no shell in final stage where practical.
- Health probes: `/health/live` (liveness) and `/health/ready` (bundle readiness). Bounded concurrency via `uvicorn --workers 2 --limit-concurrency 64`.
- Run with `--read-only --cap-drop ALL --security-opt no-new-privileges`.

## Staged Deploy

1. Merge to `staging`: auto-deploy Convex staging, FastAPI staging, Vercel preview.
2. Smoke: `tools/smoke_demo.py --mode normal` + `curl /health/ready` against staging URL.
3. Promote to `production` only after manual approval in GitHub environment.
4. Deploy order: Convex production (`npx convex deploy --prod`), FastAPI image (tag `sha`), Next.js production (`vercel --prod`).
5. Post-deploy smoke: same checks against prod; 5-min error-rate watch.

## Smoke & Rollback

- Smoke covers 4 API + 3 frontend routes, seven rows, proof hash, NO_BID→REVIEW markers.
- Failure triggers automatic rollback: Vercel previous deployment, Fly `flyctl deploy --image previous`, Convex `npx convex deploy --prod` previous bundle (or snapshot restore).
- Rollback condition: smoke fails, error rate >5% for 5 min, or readiness fails.

## Backups

- Convex: daily snapshot export via `npx convex export --path backup/` scheduled by `crons.ts` backup checkpoint at 02:00 UTC; 30-day retention, encrypted at rest.
- File storage: Convex file backups included in export; verified checksums.
- Restore rehearsal: quarterly drill per `backup-restore-runbook.md`.

## Alerts (all routed to Slack #bidradar-alerts + PagerDuty)

- Source schedule failed (no successful run in 90 min)
- Job backlog >100 QUEUED or any RUNNING >30 min
- Failure rate >5% over 5 min (FastAPI 5xx, Convex mutation errors)
- Deadline delivery failure (Resend webhook failed after retries)
- Model cost >120% daily budget or token spike
- Storage growth >80% quota or file quota breach
- Backup failure or export checksum mismatch

## Secrets & Verification

- Rotate `BIDRADAR_WORKER_EXCHANGE_SECRET`, Clerk, Bright Data, DeepSeek, Resend via env; never log values.
- Verify with `pnpm audit`, `pip-audit`, `check_sensitive_patterns.py` in CI.

## References

- `docs/incident-runbook.md`, `docs/backup-restore-runbook.md`, `.github/workflows/deploy.yml`.
