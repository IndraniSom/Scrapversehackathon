"""Test-only fixtures for source collection behavior."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest

from backend.bright_data import BrightDataScraperStudioClient, ProviderRequestError
from backend.source_proof import (
    ProofVerificationError,
    ProviderRunMetadata,
    SourceProofArtifact,
    verify_source_proof,
)
from backend.source_runs import CollectionLimits, PortalReview, collect_source

RAW_BYTES = (
    b'[{"source":"NTPC","source_tender_id":"NTPC-7",'
    b'"reference_number":"NTPC/IT/7","authority":"NTPC Limited",'
    b'"title":"Network support","category":"NETWORKING",'
    b'"published_at":"2026-08-01T10:00:00Z",'
    b'"closes_at":"2026-09-01T15:00:00+05:30",'
    b'"canonical_url":"https://ntpctender.ntpc.co.in/tender/7"}]'
)


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


def approved_limits(raw_directory: Path, max_polls: int = 3) -> CollectionLimits:
    """Build an explicitly approved test-only collection policy."""
    return CollectionLimits(
        max_polls=max_polls,
        poll_interval_seconds=0,
        raw_directory=raw_directory,
        collector_name="ntpc-public-tenders",
        collector_config_version="manual-draft-1",
        review=PortalReview(
            portal="NTPC",
            decision="ALLOW",
            retention_decision="ALLOW",
            reviewed_at="2026-08-20",
            policy_url="https://ntpctender.ntpc.co.in/Index/Disclaimer",
            reviewer="human-reviewer",
        ),
    )


def assert_invalid_limits_rejected(raw_directory: Path) -> None:
    """Prove zero polling and negative intervals cannot reach the lifecycle."""
    values = approved_limits(raw_directory).model_dump()
    for update in ({"max_polls": 0}, {"poll_interval_seconds": -1}):
        with pytest.raises(ValueError):
            CollectionLimits.model_validate(values | update)


def run_collection(
    tmp_path: Path,
    responses: list[httpx.Response],
    *,
    sleeper: Callable[[float], None] = lambda _: None,
    limits: CollectionLimits | None = None,
):
    """Exercise collection through the real adapter with controlled HTTP only."""
    transport = httpx.MockTransport(lambda _: responses.pop(0))
    times = iter(
        [datetime(2026, 8, 20, 10, tzinfo=UTC), datetime(2026, 8, 20, 10, 1, tzinfo=UTC)]
    )
    with httpx.Client(transport=transport, base_url="https://api.brightdata.com") as http:
        client = BrightDataScraperStudioClient(http, "c_test", sleeper=sleeper)
        return collect_source(
            client,
            [{"url": "https://ntpctender.ntpc.co.in/"}],
            lambda: next(times),
            sleeper,
            limits or approved_limits(tmp_path),
        )


def write_proof_artifact(tmp_path: Path) -> tuple[Path, Path]:
    """Create a self-consistent three-run proof entirely under a test directory."""
    raw_directory = tmp_path / "raw"
    proof = run_collection(
        raw_directory,
        [httpx.Response(200, json={"collection_id": "j_same"}), httpx.Response(200, content=RAW_BYTES)],
        limits=approved_limits(raw_directory),
    )
    assert proof.status == "VERIFIED"
    runs = [
        ProviderRunMetadata(
            provider_run_id=run_id,
            terminal_state="SUCCESS",
            started_at=proof.started_at,
            completed_at=proof.completed_at,
            failure_code=None,
        )
        for run_id in ("j_same", "j_second", "j_third")
    ]
    artifact = SourceProofArtifact(
        collector_name=proof.collector_name,
        collector_config_version=proof.collector_config_version,
        runs=runs,
        chosen_proof_id="j_same",
        source_review=approved_limits(raw_directory).review,
        raw_snapshot_path=f"raw/{proof.raw_snapshot_sha256}.json",
        proof=proof,
    )
    artifact_path = tmp_path / "source-proof.json"
    artifact_path.write_text(artifact.model_dump_json(indent=2))
    return artifact_path, raw_directory / f"{proof.raw_snapshot_sha256}.json"


def assert_chosen_timestamp_mismatch_rejected(artifact_path: Path) -> None:
    """Mutate chosen run timing and prove offline metadata correlation rejects it."""
    original = artifact_path.read_bytes()
    artifact = SourceProofArtifact.model_validate_json(original)
    artifact.runs[0].started_at += timedelta(seconds=1)
    artifact_path.write_text(artifact.model_dump_json(indent=2))
    with pytest.raises(ProofVerificationError, match="timestamp"):
        verify_source_proof(artifact_path)
    artifact_path.write_bytes(original)
