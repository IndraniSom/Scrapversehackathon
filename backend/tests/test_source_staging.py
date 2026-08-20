"""Staged collection and pre-publication safety tests."""

from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
from source_helpers import RAW_BYTES
from test_source_policy import NTPC_INPUT, approved_review

from backend.bright_data import BrightDataScraperStudioClient
from backend.source_attempts import CollectionAttemptFailure, CollectionAttemptSuccess
from backend.source_capture import load_staged_capture
from backend.source_runs import CollectionLimits, collect_source


def test_invalid_approval_makes_zero_provider_requests(tmp_path: Path) -> None:
    """A portal mismatch stops before trigger and leaves preparation storage empty."""
    requests = 0

    def handler(_: httpx.Request) -> httpx.Response:
        """Count any provider request that escapes local approval validation."""
        nonlocal requests
        requests += 1
        return httpx.Response(500)

    limits = CollectionLimits(
        max_polls=3,
        poll_interval_seconds=0,
        staging_directory=tmp_path / "preparation",
        collector_name="ntpc-public-tenders",
        collector_config_version="v1",
        review=approved_review("CPPP"),
    )
    transport = httpx.MockTransport(handler)
    with httpx.Client(transport=transport, base_url="https://api.brightdata.com") as http:
        result = collect_source(
            BrightDataScraperStudioClient(http, "c_test"),
            [NTPC_INPUT],
            lambda: datetime(2026, 8, 20, 12, tzinfo=UTC),
            lambda _: None,
            limits,
        )

    assert isinstance(result, CollectionAttemptFailure)
    assert result.failure_code == "LEGAL_VERIFY_REQUIRED"
    assert requests == 0
    assert not limits.staging_directory.exists()


def test_completed_run_is_staged_without_demo_publication(tmp_path: Path) -> None:
    """One approved run writes closed staging metadata and exact private raw bytes only."""
    responses = [
        httpx.Response(200, json={"collection_id": "j_stage_1"}),
        httpx.Response(200, json={"status": "building"}),
        httpx.Response(200, content=RAW_BYTES),
    ]
    transport = httpx.MockTransport(lambda _: responses.pop(0))
    staging = tmp_path / "preparation"
    limits = CollectionLimits(
        max_polls=3,
        poll_interval_seconds=0,
        staging_directory=staging,
        collector_name="ntpc-public-tenders",
        collector_config_version="v1",
        review=approved_review(),
    )
    times = iter(
        [datetime(2026, 8, 20, 12, tzinfo=UTC), datetime(2026, 8, 20, 12, 1, tzinfo=UTC)]
    )
    with httpx.Client(transport=transport, base_url="https://api.brightdata.com") as http:
        result = collect_source(
            BrightDataScraperStudioClient(http, "c_test"),
            [NTPC_INPUT],
            lambda: next(times),
            lambda _: None,
            limits,
        )

    assert isinstance(result, CollectionAttemptSuccess)
    capture = load_staged_capture(result.capture_path)
    assert capture.provider_run_id == "j_stage_1"
    assert capture.input_urls == [NTPC_INPUT["url"]]
    assert (staging / capture.raw_path).read_bytes() == RAW_BYTES
    assert not (tmp_path / "demo" / "raw").exists()


@pytest.mark.parametrize("decision_field", ["decision", "retention_decision"])
def test_each_non_allow_decision_makes_zero_requests(
    tmp_path: Path, decision_field: str
) -> None:
    """Either unresolved approval dimension blocks before provider traffic."""
    requests = 0

    def handler(_: httpx.Request) -> httpx.Response:
        """Count forbidden traffic for an unresolved approval decision."""
        nonlocal requests
        requests += 1
        return httpx.Response(500)

    review = approved_review().model_copy(update={decision_field: "LEGAL_VERIFY"})
    limits = CollectionLimits(
        staging_directory=tmp_path,
        collector_name="collector",
        collector_config_version="v1",
        review=review,
    )
    with httpx.Client(
        transport=httpx.MockTransport(handler), base_url="https://api.brightdata.com"
    ) as http:
        result = collect_source(
            BrightDataScraperStudioClient(http, "c_test"),
            [NTPC_INPUT],
            lambda: datetime(2026, 8, 20, 12, tzinfo=UTC),
            lambda _: None,
            limits,
        )
    assert isinstance(result, CollectionAttemptFailure)
    assert requests == 0
