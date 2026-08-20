"""Test-only fixtures for source collection behavior."""

from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest

from backend.bright_data import BrightDataScraperStudioClient, ProviderRequestError
from backend.source_attempts import CollectionAttempt
from backend.source_policy import PortalReview
from backend.source_runs import CollectionLimits, collect_source

RAW_BYTES = (
    b'[{"source":"NTPC","source_tender_id":"NTPC-7",'
    b'"reference_number":"NTPC/IT/7","authority":"NTPC Limited",'
    b'"title":"Network support","category":"NETWORKING",'
    b'"published_at":"2026-08-01T10:00:00Z",'
    b'"closes_at":"2026-09-01T15:00:00+05:30",'
    b'"canonical_url":"https://ntpctender.ntpc.co.in/tender/7"}]'
)
RAW_RECORD = {
    "source": "NTPC",
    "source_tender_id": "NTPC-7",
    "reference_number": "NTPC/IT/7",
    "authority": "NTPC Limited",
    "title": "Network support",
    "category": "NETWORKING",
    "published_at": "2026-08-01T10:00:00Z",
    "closes_at": "2026-09-01T15:00:00+05:30",
    "canonical_url": "https://ntpctender.ntpc.co.in/tender/7",
}


def assert_trigger_rejects_extra_fields() -> None:
    """Prove the provider trigger boundary rejects an expanded response shape."""
    transport = httpx.MockTransport(
        lambda _: httpx.Response(200, json={"collection_id": "j_run", "extra": "value"})
    )
    with (
        httpx.Client(transport=transport, base_url="https://api.brightdata.com") as http,
        pytest.raises(ProviderRequestError, match="MALFORMED_RESPONSE"),
    ):
        BrightDataScraperStudioClient(http, "c_test").trigger([{"url": "https://example.test"}])


def assert_trigger_success() -> None:
    """Prove a valid trigger request emits the documented query, body, and ID."""

    def handler(request: httpx.Request) -> httpx.Response:
        """Assert the complete documented trigger request and return its run ID."""
        assert request.method == "POST"
        assert request.url.path == "/dca/trigger"
        assert dict(request.url.params) == {"collector": "c_test", "queue_next": "1"}
        assert request.read() == b'[{"url":"https://example.test/tender"}]'
        return httpx.Response(200, json={"collection_id": "j_run_1"})

    transport = httpx.MockTransport(handler)
    with httpx.Client(transport=transport, base_url="https://api.brightdata.com") as http:
        snapshot = BrightDataScraperStudioClient(http, "c_test").trigger(
            [{"url": "https://example.test/tender"}]
        )
    assert snapshot.snapshot_id == "j_run_1"


def approved_limits(staging_directory: Path, max_polls: int = 3) -> CollectionLimits:
    """Build an explicitly approved test-only collection policy."""
    return CollectionLimits(
        max_polls=max_polls,
        poll_interval_seconds=0,
        staging_directory=staging_directory,
        collector_name="ntpc-public-tenders",
        collector_config_version="manual-draft-1",
        review=PortalReview(
            portal="NTPC",
            decision="ALLOW",
            retention_decision="ALLOW",
            reviewed_at="2026-08-20",
            policy_url="https://ntpctender.ntpc.co.in/Index/Disclaimer",
            reviewer="Human Reviewer",
            reviewer_kind="HUMAN",
        ),
    )


def assert_invalid_limits_rejected(staging_directory: Path) -> None:
    """Prove zero polling and negative intervals cannot reach the lifecycle."""
    values = approved_limits(staging_directory).model_dump()
    for update in (
        {"max_polls": 0},
        {"max_polls": 121},
        {"poll_interval_seconds": -1},
        {"poll_interval_seconds": 61},
    ):
        with pytest.raises(ValueError):
            CollectionLimits.model_validate(values | update)


def run_collection(
    tmp_path: Path,
    responses: list[httpx.Response],
    *,
    sleeper: Callable[[float], None] = lambda _: None,
    limits: CollectionLimits | None = None,
) -> CollectionAttempt:
    """Exercise collection through the real adapter with controlled HTTP only."""
    transport = httpx.MockTransport(lambda _: responses.pop(0))
    times = iter(
        [datetime(2026, 8, 20, 10, tzinfo=UTC), datetime(2026, 8, 20, 10, 1, tzinfo=UTC)]
    )
    with httpx.Client(transport=transport, base_url="https://api.brightdata.com") as http:
        client = BrightDataScraperStudioClient(http, "c_test", sleeper=sleeper)
        return collect_source(
            client,
            [{"url": "https://ntpctender.ntpc.co.in/Index/Search?Type=Reg&Region=1"}],
            lambda: next(times),
            sleeper,
            limits or approved_limits(tmp_path),
        )
