"""Contract tests for worker job request/result: JSON Schema, Pydantic, and OpenAPI."""

import json
import pathlib

import jsonschema
import pytest
from openapi_spec_validator import validate_spec
from pydantic import ValidationError

from backend.worker_contracts import WorkerJobRequest, WorkerJobResult

CONTRACTS_DIR = pathlib.Path(__file__).resolve().parents[2] / "contracts" / "worker"
OPENAPI_PATH = pathlib.Path(__file__).resolve().parents[2] / "contracts" / "worker-v1.openapi.json"

JOB_KINDS = [
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

TRACE = "123e4567-e89b-12d3-a456-426614174000"
HASH = "a" * 64
DIGEST = "b" * 64


def _valid_request(kind: str) -> dict:
    """Build a valid WorkerJobRequest dict for the given kind."""
    return {
        "jobId": "job_123",
        "organizationId": "org_test123",
        "kind": kind,
        "status": "QUEUED",
        "idempotencyKey": f"idem-{kind}",
        "inputRevision": "rev1",
        "inputHashes": [HASH],
        "attempt": 0,
        "maxAttempts": 3,
        "traceId": TRACE,
        "requestedBy": "user_1",
        "createdAt": 1710000000,
    }


def _valid_result(kind: str) -> dict:
    """Build a valid WorkerJobResult dict for the given kind."""
    return {
        "jobId": "job_123",
        "organizationId": "org_test123",
        "kind": kind,
        "inputRevision": "rev1",
        "inputHashes": [HASH],
        "traceId": TRACE,
        "status": "SUCCEEDED",
        "outputDigest": DIGEST,
        "signature": "c" * 64,
    }


def test_job_request_schema_validates_all_kinds() -> None:
    """Every JobKind validates against JSON Schema and Pydantic."""
    request_schema = json.loads((CONTRACTS_DIR / "job-request.schema.json").read_text())
    for kind in JOB_KINDS:
        payload = _valid_request(kind)
        jsonschema.validate(payload, request_schema)
        WorkerJobRequest.model_validate(payload)


def test_job_result_schema_validates_all_kinds() -> None:
    """Every JobKind result validates against JSON Schema and Pydantic."""
    result_schema = json.loads((CONTRACTS_DIR / "job-result.schema.json").read_text())
    for kind in JOB_KINDS:
        payload = _valid_result(kind)
        jsonschema.validate(payload, result_schema)
        WorkerJobResult.model_validate(payload)


def test_openapi_valid_and_references_worker_schemas() -> None:
    """Worker OpenAPI is valid and exposes execute and result endpoints."""
    spec = json.loads(OPENAPI_PATH.read_text())
    validate_spec(spec)
    paths = spec["paths"]
    assert "/internal/v1/jobs/{job_id}/execute" in paths
    assert "/internal/v1/jobs/{job_id}/result" in paths
    assert "WorkerJobRequest" in json.dumps(spec)
    assert "WorkerJobResult" in json.dumps(spec)


def test_job_request_rejects_invalid_hash() -> None:
    """Invalid SHA256 is rejected by both Schema and Pydantic."""
    request_schema = json.loads((CONTRACTS_DIR / "job-request.schema.json").read_text())
    payload = _valid_request("ASSESSMENT")
    payload["inputHashes"] = ["not-a-hash"]
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(payload, request_schema)
    with pytest.raises(ValidationError):
        WorkerJobRequest.model_validate(payload)


def test_job_result_requires_traceId_and_signature() -> None:
    """Missing traceId or signature fails validation."""
    for field in ["traceId", "signature"]:
        payload = _valid_result("EXPORT")
        payload.pop(field)
        with pytest.raises(ValidationError):
            WorkerJobResult.model_validate(payload)
