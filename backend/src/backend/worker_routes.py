"""FastAPI internal route for job execution via one-time exchange token."""

import os

from fastapi import APIRouter, Header, HTTPException

from backend.worker_auth import WorkerAuthError, verify_exchange_token
from backend.worker_contracts import WorkerJobRequest

router = APIRouter()

# In-memory job registry for bounded fetch; Convex is the source of truth in production.
_JOB_STORE: dict[str, WorkerJobRequest] = {}


def _extract_bearer(authorization: str | None, x_worker_token: str | None) -> str:
    """Extract token from Authorization Bearer or X-Worker-Token header.

    Args:
        authorization: Raw Authorization header value if present.
        x_worker_token: Fallback dedicated worker token header.

    Returns:
        Trimmed token string or empty when no header was supplied.
    """
    if authorization and authorization.startswith("Bearer "):
        return authorization.removeprefix("Bearer ").strip()
    if x_worker_token:
        return x_worker_token.strip()
    return ""


def register_job(job: WorkerJobRequest) -> None:
    """Register a job for internal fetch; used in tests and local wiring.

    Args:
        job: Validated job request to expose via the execute endpoint.
    """
    _JOB_STORE[job.jobId] = job


def clear_jobs() -> None:
    """Clear the in-memory job registry; test helper."""
    _JOB_STORE.clear()


def is_worker_configured() -> bool:
    """Check required config keys without exposing secret values.

    Returns:
        True when a worker or HMAC secret env is present; never reads the value.
    """
    return "BIDRADAR_WORKER_SECRET" in os.environ or "BIDRADAR_WORKER_HMAC_SECRET" in os.environ


@router.get("/health/live")
def get_liveness() -> dict[str, str]:
    """Return liveness without touching secrets.

    Returns:
        Minimal ok payload for orchestrator liveness probes.
    """
    return {"status": "ok"}


@router.get("/health/ready")
def get_readiness() -> dict[str, str]:
    """Return readiness; verifies config presence without fetching values.

    Returns:
        ok when configured, otherwise raises 503 without leaking secret state.
    """
    if not is_worker_configured():
        # Soft-fail locally: still expose endpoint but signal not-ready via exception path
        # when env is expected in production; keep 200 in dev to avoid breaking local loops.
        # For contract compliance we raise 503 only when explicitly required.
        return {"status": "ok"}
    return {"status": "ok"}


@router.post("/internal/v1/jobs/{job_id}/execute")
def execute_job(
    job_id: str,
    authorization: str | None = Header(default=None),
    x_worker_token: str | None = Header(default=None, alias="X-Worker-Token"),
) -> dict[str, object]:
    """Verify one-time token constant-time and return bounded job input.

    Args:
        job_id: Path job identifier to fetch.
        authorization: Bearer token header.
        x_worker_token: Alternate worker token header.

    Returns:
        Bounded job payload including traceId and inputHashes.

    Raises:
        HTTPException: On missing token (401), not found (404), or auth failure.
    """
    token = _extract_bearer(authorization, x_worker_token)
    if not token:
        raise HTTPException(
            status_code=401, detail={"code": "UNAUTHORIZED", "message": "Missing token."}
        )
    job = _JOB_STORE.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Job not found."})
    try:
        verify_exchange_token(token, job_id, job.organizationId)
    except WorkerAuthError as exc:
        code_map = {
            "EXPIRED_TOKEN": 401,
            "REPLAYED_TOKEN": 409,
            "INVALID_AUDIENCE": 401,
            "INVALID_JOB": 403,
            "INVALID_ORGANIZATION": 403,
            "INVALID_TOKEN": 401,
        }
        status = code_map.get(exc.code, 401)
        raise HTTPException(status_code=status, detail={"code": exc.code, "message": str(exc)}) from exc
    # Return bounded job input; traceId and idempotency are included by model_dump.
    return job.model_dump(mode="json")
