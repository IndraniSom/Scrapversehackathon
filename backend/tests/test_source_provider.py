"""Provider-object, NTPC mapping, and local-calendar integration tests."""

from datetime import UTC, datetime

import httpx
import pytest
from pydantic import ValidationError
from test_source_policy import approved_review

from backend.bright_data import BrightDataScraperStudioClient
from backend.contracts.source import SnapshotBuilding, SnapshotFailure, SnapshotReady
from backend.source_policy import ApprovalError, validate_collection_inputs
from backend.source_provider import normalize_provider_record

NTPC_URL = "https://ntpctender.ntpc.co.in/Index/Search"
PROVIDER_RECORD = {
    "sourceTenderId": "NTPC-REAL-1",
    "referenceNumber": "NTPC-REAL-1",
    "authority": "Renewable Energy",
    "title": "Wind turbine generators",
    "canonicalUrl": "https://ntpctender.ntpc.co.in/NITDetails/NITs/30166",
    "input": {"url": NTPC_URL},
}
PROVIDER_BYTES = (
    b'{"sourceTenderId":"NTPC-REAL-1","referenceNumber":"NTPC-REAL-1",'
    b'"authority":"Renewable Energy","title":"Wind turbine generators",'
    b'"canonicalUrl":"https://ntpctender.ntpc.co.in/NITDetails/NITs/30166",'
    b'"input":{"url":"https://ntpctender.ntpc.co.in/Index/Search"}}'
)


def test_fetch_accepts_single_provider_object_and_preserves_exact_bytes() -> None:
    """One completed provider object becomes a ready snapshot without re-encoding."""
    transport = httpx.MockTransport(lambda _: httpx.Response(200, content=PROVIDER_BYTES))
    with httpx.Client(transport=transport, base_url="https://api.brightdata.com") as http:
        result = BrightDataScraperStudioClient(http, "c_test").fetch("j_test")
    assert result == SnapshotReady(records=[PROVIDER_RECORD], raw_bytes=PROVIDER_BYTES)


@pytest.mark.parametrize(
    "body",
    [
        b"[]",
        b'{"status":"complete"}',
        b'{"foo":"bar"}',
    ],
)
def test_fetch_rejects_empty_or_nonrecord_response(body: bytes) -> None:
    """Empty arrays, status objects, and unrelated objects never become ready records."""
    transport = httpx.MockTransport(lambda _: httpx.Response(200, content=body))
    with httpx.Client(transport=transport, base_url="https://api.brightdata.com") as http:
        result = BrightDataScraperStudioClient(http, "c_test").fetch("j_test")
    assert isinstance(result, SnapshotFailure)


@pytest.mark.parametrize(
    "body",
    [b"{}", b'{"message":"building"}', b'{"status":"building","extra":1}'],
)
def test_fetch_rejects_missing_or_expanded_building_discriminator(body: bytes) -> None:
    """Only the exact explicit building object can consume another poll attempt."""
    transport = httpx.MockTransport(lambda _: httpx.Response(200, content=body))
    with httpx.Client(transport=transport, base_url="https://api.brightdata.com") as http:
        result = BrightDataScraperStudioClient(http, "c_test").fetch("j_test")
    assert isinstance(result, SnapshotFailure)


def test_building_model_requires_explicit_status() -> None:
    """The status discriminator cannot materialize from a Pydantic default."""
    with pytest.raises(ValidationError):
        SnapshotBuilding.model_validate({})


def test_ntpc_provider_record_maps_deterministically_without_invented_fields() -> None:
    """CamelCase NTPC output maps to the frozen summary with honest null dates."""
    normalized = normalize_provider_record(PROVIDER_RECORD, "a" * 64)
    assert normalized.model_dump(mode="json") == {
        "source": "NTPC",
        "source_tender_id": "NTPC-REAL-1",
        "reference_number": "NTPC-REAL-1",
        "authority": "Renewable Energy",
        "title": "Wind turbine generators",
        "category": "OTHER",
        "published_at": None,
        "closes_at": None,
        "canonical_url": "https://ntpctender.ntpc.co.in/NITDetails/NITs/30166",
        "id": "ntpc-c9d9e479093d",
        "data_mode": "RECORDED_BRIGHT_DATA_SNAPSHOT",
        "snapshot_sha256": "a" * 64,
    }


@pytest.mark.parametrize("detail_id", ["0", "0001"])
def test_ntpc_provider_rejects_nonpositive_or_zero_padded_detail_id(
    detail_id: str,
) -> None:
    """Provider detail IDs must match the parser's positive non-zero-leading rule."""
    record = PROVIDER_RECORD | {
        "canonicalUrl": f"https://ntpctender.ntpc.co.in/NITDetails/NITs/{detail_id}"
    }
    with pytest.raises(ValidationError):
        normalize_provider_record(record, "a" * 64)


def test_ntpc_no_query_input_is_approved_on_local_review_date() -> None:
    """The published no-query input is same-day when UTC is viewed in Asia/Kolkata."""
    started = datetime(2026, 8, 19, 19, 48, tzinfo=UTC)
    assert validate_collection_inputs(
        [{"url": NTPC_URL}], approved_review(), started
    ) == [{"url": NTPC_URL}]


def test_ntpc_review_after_local_run_date_is_rejected() -> None:
    """A UTC timestamp before the India calendar boundary cannot use tomorrow's review."""
    started = datetime(2026, 8, 19, 18, 29, tzinfo=UTC)
    with pytest.raises(ApprovalError):
        validate_collection_inputs([{"url": NTPC_URL}], approved_review(), started)
