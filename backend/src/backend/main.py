"""FastAPI factory with immutable bundle, security headers, and rate limits."""

import json
import os
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from hashlib import sha256
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.artifacts import load_demo_bundle
from backend.config import Settings
from backend.contracts.api import ErrorCode, failure
from backend.observability import ObservabilityMiddleware
from backend.routes import DemoUnavailable, OpportunityNotFound, router
from backend.worker_callback import router as worker_callback_router
from backend.worker_routes import router as worker_router

CONTRACT_PATH = Path(__file__).resolve().parents[3] / "contracts" / "api-v1.openapi.json"
CONTRACT_SHA256 = "bb7df948805027b7325d243a094e48f290371547ae39c2dfd27de093414ca2b1"

SECURITY_HEADERS = {
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
}

ALLOWED_ORIGINS = [o.strip() for o in os.getenv("BIDRADAR_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()]

RATE_LIMITS: dict[str, tuple[int, int]] = {
    "default": (120, 60),
    "/api/v1/opportunities": (60, 60),
    "/health": (120, 60),
    "/api/files": (10, 60),
    "/api/search": (60, 60),
    "/api/ai": (20, 60),
    "/api/export": (10, 60),
    "/webhook": (30, 60),
}

_request_log: dict[str, list[float]] = {}


def _is_rate_limited(key: str, limit: int, window: int) -> bool:
    """Sliding window check; returns True when limit exceeded."""
    now = time.monotonic()
    lst = _request_log.setdefault(key, [])
    cutoff = now - window
    while lst and lst[0] < cutoff:
        lst.pop(0)
    if len(lst) >= limit:
        return True
    lst.append(now)
    return False


def clear_rate_limits() -> None:
    """Clear in-memory rate state for tests."""
    _request_log.clear()


def create_app(settings: Settings) -> FastAPI:
    """Create six read-only routes with lifespan and security."""

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        """Install verified bundle before traffic and remove on stop."""
        application.state.bundle = load_demo_bundle(settings.demo_data_dir)
        try:
            yield
        finally:
            del application.state.bundle

    app = FastAPI(
        title="BidRadar Read-Only API",
        version="1.0.0",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
    app.add_middleware(ObservabilityMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
        max_age=600,
    )

    @app.middleware("http")
    async def security_and_rate(request: Request, call_next):  # type: ignore[no-untyped-def]
        """Enforce per-route/org rate limits and add security headers."""
        path = request.url.path
        limit_key = "default"
        for prefix in RATE_LIMITS:
            if path.startswith(prefix):
                limit_key = prefix
                break
        limit, window = RATE_LIMITS[limit_key]
        client_ip = request.client.host if request.client else "unknown"
        org = request.headers.get("x-organization-id") or request.headers.get("x-org-id") or "anon"
        key = f"{client_ip}:{org}:{limit_key}"
        if _is_rate_limited(key, limit, window):
            from uuid import uuid4
            content = {"request_id": str(uuid4()), "error": {"code": "RATE_LIMITED", "message": "Too many requests."}}
            resp = JSONResponse(status_code=429, content=content)
            for k, v in SECURITY_HEADERS.items():
                resp.headers[k] = v
            return resp
        response = await call_next(request)
        for k, v in SECURITY_HEADERS.items():
            response.headers.setdefault(k, v)
        # Narrow CORS echo only allowlisted origins
        origin = request.headers.get("origin")
        if origin and origin not in ALLOWED_ORIGINS and "access-control-allow-origin" in response.headers:
            del response.headers["access-control-allow-origin"]
        return response

    app.include_router(router)
    app.include_router(worker_router)
    app.include_router(worker_callback_router)
    _install_handlers(app)
    frozen = _load_frozen_contract()

    def frozen_openapi() -> dict[str, object]:
        """Return frozen contract rather than drift."""
        return frozen

    app.openapi = frozen_openapi  # type: ignore[method-assign]
    return app


def _load_frozen_contract() -> dict[str, object]:
    """Load reviewed contract bytes or fail construction."""
    try:
        raw = CONTRACT_PATH.read_bytes()
        value = json.loads(raw)
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError("frozen API contract is unavailable") from error
    if sha256(raw).hexdigest() != CONTRACT_SHA256 or not isinstance(value, dict):
        raise RuntimeError("frozen API contract hash is invalid")
    return value


def _install_handlers(app: FastAPI) -> None:
    """Install safe UUID error envelopes without leakage."""

    @app.exception_handler(RequestValidationError)
    async def contract_validation_failed(_request: Request, _error: RequestValidationError) -> JSONResponse:
        """Map validation to safe 422 envelope."""
        return _error_response(422, "CONTRACT_VALIDATION_FAILED", "Request did not match the API contract.")

    @app.exception_handler(StarletteHTTPException)
    async def undeclared_request(_request: Request, error: StarletteHTTPException) -> JSONResponse:
        """Map undeclared paths to safe errors."""
        return _error_response(error.status_code, "CONTRACT_VALIDATION_FAILED", "Request did not match the API contract.")

    @app.exception_handler(OpportunityNotFound)
    async def opportunity_not_found(_request: Request, _error: OpportunityNotFound) -> JSONResponse:
        """Map unknown assessed id to 404 branch."""
        return _error_response(404, "OPPORTUNITY_NOT_FOUND", "Opportunity was not found.")

    @app.exception_handler(DemoUnavailable)
    async def demo_unavailable(_request: Request, _error: DemoUnavailable) -> JSONResponse:
        """Map missing readiness to 503 branch."""
        return _error_response(503, "DEMO_DATA_UNAVAILABLE", "Validated demo data is unavailable.")

    @app.exception_handler(Exception)
    async def internal_error(_request: Request, _error: Exception) -> JSONResponse:
        """Map unexpected errors to generic envelope."""
        return _error_response(500, "INTERNAL_ERROR", "Request could not be completed.")


def _error_response(status_code: int, code: ErrorCode, message: str) -> JSONResponse:
    """Serialize closed error envelope."""
    envelope = failure(code, message)
    resp = JSONResponse(status_code=status_code, content=envelope.model_dump(mode="json"))
    for k, v in SECURITY_HEADERS.items():
        resp.headers[k] = v
    return resp


app = create_app(Settings())
