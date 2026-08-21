"""Authenticated FastAPI execution boundary for registered worker jobs."""

import os
from collections.abc import Callable, Mapping
from pathlib import Path

from fastapi import APIRouter, Header, HTTPException

from backend.document_pipeline import run_document_pipeline
from backend.documents import DocumentLimits
from backend.embeddings import MODEL_REVISION, embed_passage, embed_query
from backend.ocr import OcrMyPdfEngine
from backend.worker_auth import WorkerAuthError, verify_exchange_token
from backend.worker_contracts import JobKind, WorkerJobRequest

router = APIRouter()
JobPayload = Mapping[str, object]
JobOutput = dict[str, object]
JobHandler = Callable[[WorkerJobRequest, JobPayload], JobOutput]

_JOB_STORE: dict[str, WorkerJobRequest] = {}
_PAYLOAD_STORE: dict[str, dict[str, object]] = {}
_HANDLERS: dict[JobKind, JobHandler] = {}


def _extract_bearer(authorization: str | None, worker_token: str | None) -> str:
    """Extract bearer token without reflecting it in errors."""
    if authorization and authorization.startswith("Bearer "):
        return authorization.removeprefix("Bearer ").strip()
    return worker_token.strip() if worker_token else ""


def register_job(job: WorkerJobRequest, payload: Mapping[str, object] | None = None) -> None:
    """Register bounded job metadata and payload for worker execution."""
    _JOB_STORE[job.jobId] = job
    _PAYLOAD_STORE[job.jobId] = dict(payload or {})


def register_handler(kind: JobKind, handler: JobHandler) -> None:
    """Register one explicit domain handler for a worker job kind."""
    _HANDLERS[kind] = handler


def clear_jobs() -> None:
    """Clear local registries used by deterministic tests and single-process workers."""
    _JOB_STORE.clear()
    _PAYLOAD_STORE.clear()


def is_worker_configured() -> bool:
    """Return whether worker authentication is configured or demo mode is explicit."""
    return os.getenv("BIDRADAR_DEMO_MODE") == "1" or bool(
        os.getenv("BIDRADAR_WORKER_SECRET") or os.getenv("BIDRADAR_WORKER_HMAC_SECRET")
    )


def _embedding_handler(_job: WorkerJobRequest, payload: JobPayload) -> JobOutput:
    """Generate one real query or passage embedding from bounded text."""
    text = payload.get("text")
    mode = payload.get("mode", "query")
    if not isinstance(text, str) or mode not in {"query", "passage"}:
        raise ValueError("INVALID_EMBEDDING_INPUT")
    vector = embed_query(text) if mode == "query" else embed_passage(text)
    return {"embedding": vector, "modelRevision": MODEL_REVISION}


def _document_handler(_job: WorkerJobRequest, payload: JobPayload) -> JobOutput:
    """Parse a bounded local document and expose safe structural metadata."""
    path = payload.get("path")
    if not isinstance(path, str):
        raise TypeError("INVALID_DOCUMENT_INPUT")
    result = run_document_pipeline(Path(path), DocumentLimits())
    return {"result": result.model_dump(mode="json")}


def _ocr_handler(_job: WorkerJobRequest, payload: JobPayload) -> JobOutput:
    """OCR a bounded local PDF using the concrete isolated OCR engine."""
    path = payload.get("path")
    if not isinstance(path, str):
        raise TypeError("INVALID_DOCUMENT_INPUT")
    result = run_document_pipeline(Path(path), DocumentLimits(), ocr_engine=OcrMyPdfEngine())
    return {"result": result.model_dump(mode="json")}


register_handler("EMBEDDING", _embedding_handler)
register_handler("DOCUMENT_PARSE", _document_handler)
register_handler("DOCUMENT_OCR", _ocr_handler)


@router.post("/internal/v1/jobs/{job_id}/execute")
def execute_job(
    job_id: str,
    authorization: str | None = Header(default=None),
    worker_token: str | None = Header(default=None, alias="X-Worker-Token"),
) -> dict[str, object]:
    """Authenticate, dispatch, and return one bounded job result."""
    token = _extract_bearer(authorization, worker_token)
    if not token:
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": "Missing token."})
    job = _JOB_STORE.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Job not found."})
    try:
        verify_exchange_token(token, job_id, job.organizationId)
    except WorkerAuthError as error:
        status = {"REPLAYED_TOKEN": 409, "INVALID_JOB": 403, "INVALID_ORGANIZATION": 403}.get(error.code, 401)
        raise HTTPException(status_code=status, detail={"code": error.code, "message": str(error)}) from error
    handler = _HANDLERS.get(job.kind)
    if handler is None:
        raise HTTPException(status_code=422, detail={"code": "UNSUPPORTED_JOB_KIND", "message": "Worker handler unavailable."})
    try:
        output = handler(job, _PAYLOAD_STORE.get(job_id, {}))
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=422, detail={"code": str(error), "message": "Job input is invalid."}) from error
    return {"jobId": job.jobId, "organizationId": job.organizationId, "kind": job.kind, "status": "SUCCEEDED", "traceId": job.traceId, "output": output}
