"""Signed result callback with constant-time verification and stale rejection."""

import hashlib
import hmac
import json
import os

from fastapi import APIRouter, Header, HTTPException
from pydantic import ValidationError

from backend.worker_contracts import WorkerJobRequest, WorkerJobResult
from backend.worker_routes import _JOB_STORE

router = APIRouter()


def _canonical_bytes(payload: dict[str, object]) -> bytes:
    """Return canonical JSON bytes for HMAC (sorted keys, no whitespace)."""
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def sign_result(payload: dict[str, object], secret: str) -> str:
    """Sign canonical payload with HMAC-SHA256 and return hex digest."""
    return hmac.new(secret.encode(), _canonical_bytes(payload), hashlib.sha256).hexdigest()


def verify_signature(payload: dict[str, object], signature: str, secret: str) -> bool:
    """Verify HMAC-SHA256 signature using constant-time comparison."""
    expected = sign_result(payload, secret)
    return hmac.compare_digest(expected, signature)


def is_stale(job: WorkerJobRequest, result: WorkerJobResult) -> bool:
    """Return true when result revision/hashes/trace do not match current job."""
    if result.inputRevision != job.inputRevision:
        return True
    if result.inputHashes != job.inputHashes:
        return True
    if result.traceId != job.traceId:
        return True
    if result.jobId != job.jobId:
        return True
    if result.organizationId != job.organizationId:
        return True
    return False


@router.post("/internal/v1/jobs/{job_id}/result")
def submit_job_result(
    job_id: str,
    body: dict[str, object],
    x_worker_signature: str | None = Header(default=None, alias="X-Worker-Signature"),
) -> dict[str, object]:
    """Verify signed result and reject stale or replayed completions."""
    secret = os.getenv("BIDRADAR_WORKER_HMAC_SECRET")
    if not secret:
        raise HTTPException(status_code=503, detail={"code": "WORKER_NOT_CONFIGURED", "message": "Worker callback is unavailable."})
    signature = x_worker_signature or str(body.get("signature") or "")
    # Separate signature field for verification
    payload = dict(body)
    payload.pop("signature", None)
    # Body-provided signature also checked if header missing
    sig_to_verify = signature
    if not sig_to_verify:
        raise HTTPException(status_code=400, detail={"code": "INVALID_SIGNATURE", "message": "Missing signature."})
    # Constant-time signature verification
    if not verify_signature(payload, sig_to_verify, secret):
        raise HTTPException(status_code=400, detail={"code": "INVALID_SIGNATURE", "message": "Signature mismatch."})
    # Validate schema
    try:
        result = WorkerJobResult.model_validate(body)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail={"code": "VALIDATION_FAILED", "message": str(exc)}) from exc
    job = _JOB_STORE.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Job not found."})
    if is_stale(job, result):
        raise HTTPException(status_code=409, detail={"code": "STALE_RESULT", "message": "Input revision is stale."})
    # Safe failure codes only; detailed diagnostics stay in worker logs with traceId
    return {"jobId": job_id, "status": result.status, "traceId": result.traceId}
