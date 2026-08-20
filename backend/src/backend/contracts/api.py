"""Closed health, success-envelope, and safe error contracts."""

from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict

ErrorCode = Literal[
    "OPPORTUNITY_NOT_FOUND",
    "DEMO_DATA_UNAVAILABLE",
    "CONTRACT_VALIDATION_FAILED",
    "INTERNAL_ERROR",
]


class ClosedApiModel(BaseModel):
    """Reject fields outside the frozen API response boundary."""

    model_config = ConfigDict(extra="forbid")


class HealthResponse(ClosedApiModel):
    """Return the sole frozen health state for an accepted request."""

    status: Literal["ok"]


class ApiEnvelope[DataT](ClosedApiModel):
    """Wrap one validated response view with a per-request UUID."""

    request_id: UUID
    data: DataT


class ErrorDetail(ClosedApiModel):
    """Expose one frozen safe error code and non-sensitive message."""

    code: ErrorCode
    message: str


class ErrorEnvelope(ClosedApiModel):
    """Wrap one safe error with a per-request UUID."""

    request_id: UUID
    error: ErrorDetail


def success[DataT](data: DataT) -> ApiEnvelope[DataT]:
    """Create one success envelope with a fresh UUID4 request identifier."""
    return ApiEnvelope(request_id=uuid4(), data=data)


def failure(code: ErrorCode, message: str) -> ErrorEnvelope:
    """Create one safe error envelope with a fresh UUID4 request identifier."""
    return ErrorEnvelope(
        request_id=uuid4(), error=ErrorDetail(code=code, message=message)
    )
