"""Contract and validation tests for public source models."""

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError
from source_helpers import RAW_RECORD

from backend.contracts.source import (
    UnavailableSourceProof,
    VerifiedSourceProof,
)
from backend.source_runs import normalize_record, unavailable_source_view
from backend.source_views import build_unavailable_source_proof

PUBLIC_FIELDS = {
    "status",
    "data_mode",
    "reason_code",
    "collector_name",
    "collector_config_version",
    "provider_run_id",
    "started_at",
    "completed_at",
    "raw_snapshot_sha256",
    "raw_record",
    "normalized_record",
    "terminal_state",
    "failure_code",
}


def test_public_proof_branches_match_frozen_fields() -> None:
    """Both public proof branches expose exactly the frozen SourceProofView fields."""
    assert set(VerifiedSourceProof.model_fields) == PUBLIC_FIELDS
    assert set(UnavailableSourceProof.model_fields) == PUBLIC_FIELDS
    unavailable = build_unavailable_source_proof("LEGAL_VERIFY_REQUIRED")
    assert unavailable.model_dump() == {
        "status": "UNAVAILABLE",
        "data_mode": "MANUAL_FIXTURE",
        "reason_code": "LEGAL_VERIFY_REQUIRED",
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


def test_internal_failure_maps_to_safe_unavailable_branch() -> None:
    """Provider diagnostics map to a frozen public view with every provider field null."""
    view = unavailable_source_view("HTTP_401")
    assert view.reason_code == "PROVIDER_UNAVAILABLE"
    assert all(
        value is None
        for field, value in view.model_dump().items()
        if field not in {"status", "data_mode", "reason_code"}
    )


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("canonical_url", "https://"),
        ("canonical_url", "http://ntpctender.ntpc.co.in/tender/7"),
        ("published_at", "2026-08-20T10:00:00"),
        ("closes_at", "2026-09-01T15:00:00"),
    ],
)
def test_normalization_rejects_invalid_url_and_naive_time(field: str, value: str) -> None:
    """Recorded rows require a real HTTPS URL and timezone-aware timestamps."""
    raw = RAW_RECORD | {field: value}
    with pytest.raises(ValidationError):
        normalize_record(raw, "a" * 64)


@pytest.mark.parametrize("source_tender_id", [".", ".."])
def test_normalization_rejects_dot_segment_source_ids(source_tender_id: str) -> None:
    """URL-significant dot segments cannot become stable recorded opportunity IDs."""
    with pytest.raises(ValidationError):
        normalize_record(RAW_RECORD | {"source_tender_id": source_tender_id}, "a" * 64)


@pytest.mark.parametrize("opportunity_id", [".", "..", "x" * 161])
def test_public_opportunity_rejects_unsafe_route_id(opportunity_id: str) -> None:
    """The Python view model mirrors the frozen route-safe OpportunityId contract."""
    normalized = normalize_record(RAW_RECORD, "a" * 64).model_dump()
    with pytest.raises(ValidationError):
        type(normalize_record(RAW_RECORD, "a" * 64)).model_validate(
            normalized | {"id": opportunity_id}
        )


def test_verified_proof_requires_ordered_aware_timestamps() -> None:
    """Public verified proof rejects naive or reverse-ordered run timestamps."""
    normalized = normalize_record(RAW_RECORD, "a" * 64)
    values = {
        "data_mode": "RECORDED_BRIGHT_DATA_SNAPSHOT",
        "collector_name": "collector",
        "collector_config_version": "v1",
        "provider_run_id": "j_1",
        "started_at": datetime(2026, 8, 20, 10, tzinfo=UTC),
        "completed_at": datetime(2026, 8, 20, 9, tzinfo=UTC),
        "raw_snapshot_sha256": "a" * 64,
        "raw_record": RAW_RECORD,
        "normalized_record": normalized,
    }
    with pytest.raises(ValidationError):
        VerifiedSourceProof.model_validate(values)
