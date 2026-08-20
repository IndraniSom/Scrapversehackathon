"""Structured observability for FastAPI, provider, and model calls."""

import hashlib
import json
import logging
import time
import uuid
from contextvars import ContextVar
from typing import Any

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

trace_ctx: ContextVar[str] = ContextVar("trace_id", default="unknown")
logger = logging.getLogger("bidradar.observability")


def hash_identifier(value: str) -> str:
    """Return a truncated SHA-256 hash for safe org/user logging."""
    if not value:
        return "unknown"
    return hashlib.sha256(value.encode()).hexdigest()[:12]


def structured_log(
    *,
    trace_id: str,
    service: str = "fastapi",
    action: str,
    status: str,
    duration_ms: int | None = None,
    org_hash: str = "unknown",
    user_hash: str = "unknown",
    job_id: str = "none",
    error_code: str | None = None,
    provider: str | None = None,
    model: str | None = None,
) -> None:
    """Emit one JSON line with trace, hashed identity, and safe error code."""
    entry: dict[str, Any] = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "service": service,
        "traceId": trace_id,
        "orgHash": org_hash,
        "userHash": user_hash,
        "jobId": job_id,
        "action": action,
        "status": status,
    }
    if duration_ms is not None:
        entry["durationMs"] = duration_ms
    if error_code:
        entry["errorCode"] = error_code
    if provider:
        entry["provider"] = provider
    if model:
        entry["model"] = model
    logger.info(json.dumps(entry))


def get_trace_id(request: Request) -> str:
    """Extract or generate a trace identifier from request headers."""
    for header in ("x-trace-id", "x-request-id", "traceparent"):
        value = request.headers.get(header)
        if value:
            if header == "traceparent":
                parts = value.split("-")
                if len(parts) >= 2:
                    return parts[1]
            else:
                return value
    return uuid.uuid4().hex[:16]


def get_hashed_identity(request: Request, header: str) -> str:
    """Hash an identity header value for logging without PII."""
    return hash_identifier(request.headers.get(header, ""))


class ObservabilityMiddleware(BaseHTTPMiddleware):
    """Attach trace correlation and duration logging to every request."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        """Record trace, timing, and safe status for the request."""
        trace_id = get_trace_id(request)
        trace_ctx.set(trace_id)
        start = time.perf_counter()
        status = "ok"
        error_code: str | None = None
        try:
            response = await call_next(request)
            if response.status_code >= 400:
                status = "error"
                error_code = f"HTTP_{response.status_code}"
            response.headers["x-trace-id"] = trace_id
            return response
        except Exception:
            status = "error"
            error_code = "INTERNAL_ERROR"
            raise
        finally:
            duration = int((time.perf_counter() - start) * 1000)
            structured_log(
                trace_id=trace_id,
                action=f"{request.method} {request.url.path}",
                status=status,
                duration_ms=duration,
                org_hash=get_hashed_identity(request, "x-org-id"),
                user_hash=get_hashed_identity(request, "x-user-id"),
                job_id=request.headers.get("x-job-id", "none"),
                error_code=error_code,
            )


def log_provider_call(
    *,
    trace_id: str,
    provider: str,
    action: str,
    status: str,
    duration_ms: int,
    job_id: str = "none",
    error_code: str | None = None,
) -> None:
    """Log a Bright Data or Resend provider invocation with trace."""
    structured_log(
        trace_id=trace_id,
        service="provider",
        provider=provider,
        action=action,
        status=status,
        duration_ms=duration_ms,
        job_id=job_id,
        error_code=error_code,
    )


def log_model_usage(
    *,
    trace_id: str,
    model: str,
    action: str,
    status: str,
    duration_ms: int,
    job_id: str = "none",
    error_code: str | None = None,
) -> None:
    """Log a DeepSeek model invocation with trace and hashed job context."""
    structured_log(
        trace_id=trace_id,
        service="model",
        model=model,
        action=action,
        status=status,
        duration_ms=duration_ms,
        job_id=job_id,
        error_code=error_code,
    )


def current_trace_id() -> str:
    """Return the current request trace identifier from context."""
    return trace_ctx.get()
