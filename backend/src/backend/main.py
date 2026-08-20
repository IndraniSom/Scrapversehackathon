"""FastAPI application factory with fail-fast immutable bundle lifespan."""

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from hashlib import sha256
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.artifacts import load_demo_bundle
from backend.config import Settings
from backend.contracts.api import ErrorCode, failure
from backend.routes import (
    DemoUnavailable,
    OpportunityNotFound,
    router,
)

CONTRACT_PATH = Path(__file__).resolve().parents[3] / "contracts" / "api-v1.openapi.json"
CONTRACT_SHA256 = "7256e33df529de365bdc1263a188a17a8d3d3c4035c905d067ded286e7333a3e"


def create_app(settings: Settings) -> FastAPI:
    """Create six read-only routes whose lifespan validates and loads once."""

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        """Install one fully verified bundle before traffic and remove it on stop."""
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
    app.include_router(router)
    _install_handlers(app)
    frozen = _load_frozen_contract()

    def frozen_openapi() -> dict[str, object]:
        """Return the reviewed frozen contract rather than framework-derived drift."""
        return frozen

    app.openapi = frozen_openapi
    return app


def _load_frozen_contract() -> dict[str, object]:
    """Load the exact reviewed contract bytes or fail application construction."""
    try:
        raw = CONTRACT_PATH.read_bytes()
        value = json.loads(raw)
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError("frozen API contract is unavailable") from error
    if sha256(raw).hexdigest() != CONTRACT_SHA256 or not isinstance(value, dict):
        raise RuntimeError("frozen API contract hash is invalid")
    return value


def _install_handlers(app: FastAPI) -> None:
    """Install safe UUID error envelopes without internal paths or stack details."""

    @app.exception_handler(RequestValidationError)
    async def contract_validation_failed(
        _request: Request, _error: RequestValidationError
    ) -> JSONResponse:
        """Map request validation to a safe non-reflective 422 envelope."""
        return _error_response(
            422,
            "CONTRACT_VALIDATION_FAILED",
            "Request did not match the API contract.",
        )

    @app.exception_handler(StarletteHTTPException)
    async def undeclared_request(
        _request: Request, error: StarletteHTTPException
    ) -> JSONResponse:
        """Map undeclared paths or methods to safe non-reflective UUID errors."""
        return _error_response(
            error.status_code,
            "CONTRACT_VALIDATION_FAILED",
            "Request did not match the API contract.",
        )

    @app.exception_handler(OpportunityNotFound)
    async def opportunity_not_found(
        _request: Request, _error: OpportunityNotFound
    ) -> JSONResponse:
        """Map an unknown assessed identifier to the frozen 404 branch."""
        return _error_response(
            404, "OPPORTUNITY_NOT_FOUND", "Opportunity was not found."
        )

    @app.exception_handler(DemoUnavailable)
    async def demo_unavailable(
        _request: Request, _error: DemoUnavailable
    ) -> JSONResponse:
        """Map missing in-memory readiness data to the frozen 503 branch."""
        return _error_response(
            503, "DEMO_DATA_UNAVAILABLE", "Validated demo data is unavailable."
        )

    @app.exception_handler(Exception)
    async def internal_error(_request: Request, _error: Exception) -> JSONResponse:
        """Map unexpected runtime errors to a generic non-sensitive envelope."""
        return _error_response(
            500, "INTERNAL_ERROR", "Request could not be completed."
        )


def _error_response(status_code: int, code: ErrorCode, message: str) -> JSONResponse:
    """Serialize one closed error envelope into a JSON response."""
    envelope = failure(code, message)
    return JSONResponse(
        status_code=status_code,
        content=envelope.model_dump(mode="json"),
    )


app = create_app(Settings())
