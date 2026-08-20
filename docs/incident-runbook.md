# Incident Runbook — BidRadar

## Severity

- SEV1: data loss, tenant leak, prod down. SEV2: degraded (backlog, source fail). SEV3: minor (cost warning, storage).

## On-call

- Primary via PagerDuty rotation; escalate after 15 min. Slack #bidradar-incidents, status page update within 30 min.

## General Flow

1. Detect via alerts/dashboard. 2. Triage: scope, tenant impact, traceId. 3. Mitigate: feature flag, rollback, or scale. 4. Recover: verify smoke. 5. Postmortem within 48h with action owners.

## Structured Logs

Use `traceId`, `orgHash`, `userHash`, `jobId` to correlate across Next/Convex/FastAPI/provider/model. Never share raw identifiers.

## Alert Runbooks

### Source schedule failed
- Check `sourceRuns` last success, Bright Data webhook logs, `x-trace-id`.
- Verify connector enabled, collector version, provider status.
- Replay from recorded snapshot if provider down; notify bid managers.

### Job backlog / stuck RUNNING
- Query `jobs` by `by_organization_status_kind_createdAt`, check Workpool concurrency, FastAPI health, worker logs.
- Cancel stale RUNNING >30 min, requeue QUEUED with same idempotencyKey, scale worker if needed.

### Elevated failure rate (5xx)
- Check FastAPI `/health/ready`, Convex logs, errorCode histogram, trace sampling.
- Rollback last deploy if correlated; block offending deploy tag.

### Deadline delivery failure
- Check `notificationDeliveries`, Resend webhooks, `crons.ts` deadline job, digest queue.
- Retry via idempotent Resend key; verify recipient prefs and quiet hours; manual email fallback.

### Model cost spike
- Check `aiRuns` tokens/cost by feature, rate-limiter counters, prompt hashes.
- Disable non-critical AI features via admin flag, lower `maxAttempts`, enforce per-org budget.

### Storage growth / quota
- Check Convex file storage usage, `companyDocuments` size, export artifacts.
- Enforce 15 MB limit, prune expired snapshots per `retention.ts` dry-run, alert org admins.

### Backup failure
- Check Convex export logs, checksum, storage destination, cron history.
- Re-run export, verify snapshot, escalate to SEV1 if two consecutive failures. Follow `backup-restore-runbook.md`.

## Communication

Template: `Impact | Scope | Mitigation | ETA | Next update`. Update every 30 min for SEV1.

## Postmortem Checklist

- Timeline with traceIds, root cause, tenant impact, fix, verification, prevention, owner, due date. No blame.
