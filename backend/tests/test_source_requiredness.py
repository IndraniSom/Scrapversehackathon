"""Required-field parity tests for both frozen public source-proof branches."""

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker
from pydantic import BaseModel, ValidationError
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012
from source_helpers import RAW_RECORD

from backend.contracts.source import UnavailableSourceProof, VerifiedSourceProof
from backend.source_runs import normalize_record

ROOT = Path(__file__).parents[2]
CONTRACT_URI = "urn:bidradar:requiredness"


def verified_values() -> dict[str, object]:
    """Return one hand-derived complete VERIFIED branch for omission mutations."""
    normalized = normalize_record(RAW_RECORD, "a" * 64)
    return {
        "status": "VERIFIED",
        "data_mode": "RECORDED_BRIGHT_DATA_SNAPSHOT",
        "reason_code": None,
        "collector_name": "collector",
        "collector_config_version": "v1",
        "provider_run_id": "j_1",
        "started_at": datetime(2026, 8, 20, 10, tzinfo=UTC),
        "completed_at": datetime(2026, 8, 20, 11, tzinfo=UTC),
        "raw_snapshot_sha256": "a" * 64,
        "raw_record": RAW_RECORD,
        "normalized_record": normalized.model_dump(mode="json"),
        "terminal_state": "SUCCESS",
        "failure_code": None,
    }


def unavailable_values() -> dict[str, object]:
    """Return one hand-derived complete UNAVAILABLE branch for omission mutations."""
    return {
        "status": "UNAVAILABLE",
        "data_mode": "MANUAL_FIXTURE",
        "reason_code": "PROOF_NOT_CAPTURED",
        "collector_name": None,
        "collector_config_version": None,
        "provider_run_id": None,
        "started_at": None,
        "completed_at": None,
        "raw_snapshot_sha256": None,
        "raw_record": None,
        "normalized_record": None,
        "terminal_state": None,
        "failure_code": None,
    }


BRANCHES: tuple[tuple[type[BaseModel], dict[str, object]], ...] = (
    (VerifiedSourceProof, verified_values()),
    (UnavailableSourceProof, unavailable_values()),
)


@pytest.mark.parametrize(
    ("model", "values", "missing"),
    [
        (model, values, field)
        for model, values in BRANCHES
        for field in values
    ],
)
def test_pydantic_requires_every_frozen_public_field(
    model: type[BaseModel], values: dict[str, object], missing: str
) -> None:
    """Removing any frozen field fails Pydantic instead of materializing a default."""
    with pytest.raises(ValidationError):
        model.model_validate({key: value for key, value in values.items() if key != missing})


def source_proof_validator() -> Draft202012Validator:
    """Build a frozen OpenAPI-backed SourceProofView validator with resolved refs."""
    contract = json.loads((ROOT / "contracts/api-v1.openapi.json").read_text())
    resource = Resource.from_contents(contract, default_specification=DRAFT202012)
    registry = Registry().with_resource(CONTRACT_URI, resource)
    return Draft202012Validator(
        {"$ref": f"{CONTRACT_URI}#/components/schemas/SourceProofView"},
        registry=registry,
        format_checker=FormatChecker(),
    )


@pytest.mark.parametrize(
    ("values", "missing"),
    [(values, field) for _, values in BRANCHES for field in values],
)
def test_frozen_schema_rejects_every_missing_public_field(
    values: dict[str, object], missing: str
) -> None:
    """The frozen JSON Schema independently rejects every omitted branch field."""
    instance = {key: value for key, value in values.items() if key != missing}
    assert list(source_proof_validator().iter_errors(instance))
