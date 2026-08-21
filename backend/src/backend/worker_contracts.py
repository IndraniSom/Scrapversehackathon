"""Pydantic worker job contracts mirroring JSON Schema and OpenAPI."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Sha256 = Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]
TraceId = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")]

JobKind = Literal[
    "SOURCE_COLLECTION",
    "DOCUMENT_PARSE",
    "DOCUMENT_OCR",
    "REQUIREMENT_EXTRACTION",
    "EMBEDDING",
    "ASSESSMENT",
    "AMENDMENT_DIFF",
    "TENDER_BRIEF",
    "TENDER_QA",
    "COMPLIANCE_MATRIX",
    "PROPOSAL_OUTLINE",
    "PROPOSAL_DRAFT",
    "CLAIM_REVIEW",
    "EXPORT",
    "SUBMISSION_PACKAGE",
    "NOTIFICATION",
]

JobStatus = Literal[
    "QUEUED",
    "DISPATCHED",
    "RUNNING",
    "NEEDS_REVIEW",
    "SUCCEEDED",
    "RETRYABLE_FAILURE",
    "FAILED",
    "CANCELLED",
]

ResultStatus = Literal["SUCCEEDED", "RETRYABLE_FAILURE", "FAILED", "NEEDS_REVIEW"]


class WorkerJobRequest(BaseModel):
    """Bounded job input the worker fetches via one-time exchange token."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    jobId: Annotated[str, StringConstraints(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")]
    organizationId: Annotated[str, StringConstraints(min_length=1, pattern=r"^org_[A-Za-z0-9_-]+$")]
    kind: JobKind
    status: JobStatus
    idempotencyKey: Annotated[str, StringConstraints(min_length=1, max_length=128)]
    inputRevision: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    inputHashes: list[Sha256] = Field(min_length=1, max_length=32)
    attempt: int = Field(ge=0, le=10)
    maxAttempts: int = Field(ge=1, le=10)
    traceId: TraceId
    requestedBy: Annotated[str, StringConstraints(min_length=1)]
    createdAt: int = Field(ge=0)
    progressStage: Annotated[str, StringConstraints(min_length=1, max_length=64)] | None = None
    safeFailureCode: Annotated[str, StringConstraints(pattern=r"^[A-Z][A-Z0-9_]*$")] | None = None
    outputRefs: list[str] | None = None


class WorkerJobResult(BaseModel):
    """Signed callback payload; stale inputRevision/inputHashes are rejected."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    jobId: Annotated[str, StringConstraints(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")]
    organizationId: Annotated[str, StringConstraints(min_length=1, pattern=r"^org_[A-Za-z0-9_-]+$")]
    kind: JobKind
    inputRevision: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    inputHashes: list[Sha256] = Field(min_length=1, max_length=32)
    traceId: TraceId
    status: ResultStatus
    outputDigest: Sha256
    outputRefs: list[str] | None = None
    safeFailureCode: Annotated[str, StringConstraints(pattern=r"^[A-Z][A-Z0-9_]*$")] | None = None
    providerVersion: Annotated[str, StringConstraints(min_length=1, max_length=64)] | None = None
    modelVersion: Annotated[str, StringConstraints(min_length=1, max_length=64)] | None = None
    usage: dict[str, int] | None = None
    signature: Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]
    completedAt: int | None = Field(default=None, ge=0)
