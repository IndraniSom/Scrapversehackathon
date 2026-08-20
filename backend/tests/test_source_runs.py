"""Behavior tests for the bounded Bright Data preparation workflow."""

from http import HTTPStatus
from pathlib import Path

import httpx
import pytest
from source_helpers import (
    RAW_BYTES,
    approved_limits,
    assert_invalid_limits_rejected,
    assert_trigger_rejects_extra_fields,
    assert_trigger_success,
    run_collection,
)

from backend.bright_data import BrightDataScraperStudioClient
from backend.contracts.source import SnapshotBuilding, SnapshotFailure, SnapshotReady
from backend.source_attempts import CollectionAttemptFailure, CollectionAttemptSuccess
from backend.source_capture import load_staged_capture


def test_trigger_returns_provider_snapshot_id() -> None:
    """A valid trigger response exposes the provider's collection identifier."""
    assert_trigger_success()


def test_trigger_rejects_extra_provider_fields() -> None:
    """The untrusted trigger response remains a closed protocol boundary."""
    assert_trigger_rejects_extra_fields()


def test_fetch_distinguishes_building_from_exact_ready_bytes() -> None:
    """Polling retains exact completed bytes instead of re-encoding provider JSON."""
    responses = [
        httpx.Response(HTTPStatus.OK, json={"status": "building"}),
        httpx.Response(
            HTTPStatus.OK,
            content=b'[{"source_tender_id":"NTPC-7","title":"Network support"}]',
            headers={"content-type": "application/json"},
        ),
    ]
    transport = httpx.MockTransport(lambda _: responses.pop(0))
    with httpx.Client(transport=transport, base_url="https://api.brightdata.com") as http:
        client = BrightDataScraperStudioClient(http, "c_test")

        building = client.fetch("j_run_1")
        ready = client.fetch("j_run_1")

    assert building == SnapshotBuilding()
    assert ready == SnapshotReady(
        records=[{"source_tender_id": "NTPC-7", "title": "Network support"}],
        raw_bytes=b'[{"source_tender_id":"NTPC-7","title":"Network support"}]',
    )


@pytest.mark.parametrize("status", [401, 404, 422])
def test_fetch_maps_non_retryable_status_to_terminal_failure(status: int) -> None:
    """Authentication, lookup, and input errors terminate without retrying."""
    calls = 0

    def handler(_: httpx.Request) -> httpx.Response:
        """Count terminal fetch calls while returning a safe provider error body."""
        nonlocal calls
        calls += 1
        return httpx.Response(status, json={"error": "unsafe provider detail"})

    transport = httpx.MockTransport(handler)
    with httpx.Client(transport=transport, base_url="https://api.brightdata.com") as http:
        result = BrightDataScraperStudioClient(http, "c_test").fetch("j_run_1")

    assert result == SnapshotFailure(code=f"HTTP_{status}")
    assert calls == 1


@pytest.mark.parametrize("transient", [429, 500, "network"])
def test_fetch_bounds_transient_retries(transient: int | str) -> None:
    """Network, rate-limit, and server failures stop after a fixed attempt budget."""
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        """Return the selected transient response while counting bounded attempts."""
        nonlocal calls
        calls += 1
        if transient == "network":
            raise httpx.ConnectError("connection failed", request=request)
        return httpx.Response(transient)

    transport = httpx.MockTransport(handler)
    with httpx.Client(transport=transport, base_url="https://api.brightdata.com") as http:
        result = BrightDataScraperStudioClient(
            http, "c_test", max_attempts=3, sleeper=lambda _: None
        ).fetch("j_run_1")

    assert result == SnapshotFailure(code="TRANSIENT_RETRIES_EXHAUSTED")
    assert calls == 3


def test_fetch_rejects_malformed_json() -> None:
    """A completed HTTP response with invalid JSON becomes a safe terminal failure."""
    transport = httpx.MockTransport(
        lambda _: httpx.Response(HTTPStatus.OK, content=b"not-json")
    )
    with httpx.Client(transport=transport, base_url="https://api.brightdata.com") as http:
        result = BrightDataScraperStudioClient(http, "c_test").fetch("j_run_1")

    assert result == SnapshotFailure(code="MALFORMED_RESPONSE")


def test_collect_polls_to_ready_hashes_normalizes_and_stages(tmp_path: Path) -> None:
    """A completed approved run becomes a private staged attempt, not public proof."""
    attempt = run_collection(
        tmp_path,
        [
            httpx.Response(200, json={"collection_id": "j_run_1"}),
            httpx.Response(200, json={"status": "building"}),
            httpx.Response(200, content=RAW_BYTES),
        ],
    )

    assert isinstance(attempt, CollectionAttemptSuccess)
    capture = load_staged_capture(attempt.capture_path)
    assert attempt.provider_run_id == "j_run_1"
    assert capture.normalized_record.source_tender_id == "NTPC-7"
    assert (tmp_path / capture.raw_path).read_bytes() == RAW_BYTES


@pytest.mark.parametrize(
    ("dataset", "failure_code"),
    [(b"[]", "EMPTY_RESULT"), (b'[{"title":"No stable ID"}]', "INVALID_RECORD")],
)
def test_collect_rejects_unusable_ready_results(
    tmp_path: Path, dataset: bytes, failure_code: str
) -> None:
    """Empty datasets and rows without required stable fields remain unavailable."""
    attempt = run_collection(
        tmp_path,
        [httpx.Response(200, json={"collection_id": "j_bad"}), httpx.Response(200, content=dataset)],
    )

    assert isinstance(attempt, CollectionAttemptFailure)
    assert attempt.data_mode == "MANUAL_FIXTURE"
    assert attempt.failure_code == failure_code
    assert not tmp_path.exists() or list(tmp_path.iterdir()) == []


def test_collect_bounds_polling_and_handles_interruption(tmp_path: Path) -> None:
    """Polling exhaustion and operator interruption terminate without a live claim."""
    timeout = run_collection(
        tmp_path,
        [httpx.Response(200, json={"collection_id": "j_wait"}), httpx.Response(200, json={"status": "building"})],
        limits=approved_limits(tmp_path, max_polls=1),
    )
    interrupted = run_collection(
        tmp_path,
        [httpx.Response(200, json={"collection_id": "j_stop"}), httpx.Response(500)],
        sleeper=lambda _: (_ for _ in ()).throw(KeyboardInterrupt()),
    )
    rejected = run_collection(
        tmp_path, [httpx.Response(200, json={"collection_id": "j_no"}), httpx.Response(401)]
    )

    assert (timeout.failure_code, interrupted.failure_code, rejected.failure_code) == (
        "POLL_TIMEOUT", "INTERRUPTED", "HTTP_401"
    )
    assert {timeout.data_mode, interrupted.data_mode, rejected.data_mode} == {"MANUAL_FIXTURE"}


def test_collect_requires_human_allow_before_request(tmp_path: Path) -> None:
    """LEGAL_VERIFY blocks collection before provider or portal traffic occurs."""
    assert_invalid_limits_rejected(tmp_path)
    limits = approved_limits(tmp_path).model_copy(
        update={"review": approved_limits(tmp_path).review.model_copy(update={"decision": "LEGAL_VERIFY"})}
    )
    attempt = run_collection(tmp_path, [], limits=limits)

    assert attempt.failure_code == "LEGAL_VERIFY_REQUIRED"
    assert attempt.provider_run_id is None


def test_identical_snapshot_is_deduplicated(tmp_path: Path) -> None:
    """Repeated exact provider bytes reuse one content-addressed snapshot file."""
    responses = [httpx.Response(200, json={"collection_id": "j_same"}), httpx.Response(200, content=RAW_BYTES)]
    first = run_collection(tmp_path, responses.copy())
    second = run_collection(tmp_path, responses.copy())

    assert first.raw_snapshot_sha256 == second.raw_snapshot_sha256
    assert len(list(tmp_path.glob("*.raw.json"))) == 1
