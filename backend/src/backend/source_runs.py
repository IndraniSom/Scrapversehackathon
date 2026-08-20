"""Bounded source-run lifecycle and content-addressed capture."""

from collections.abc import Callable, Mapping, Sequence
from datetime import date, datetime
from hashlib import sha256
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue, ValidationError

from backend.bright_data import BrightDataScraperStudioClient, ProviderRequestError
from backend.contracts.source import (
    OpportunitySummary,
    RawOpportunity,
    SnapshotFailure,
    SnapshotReady,
    SourceProof,
    UnavailableSourceProof,
    VerifiedSourceProof,
)


class PortalReview(BaseModel):
    """Record a human portal decision separately for collection and retention."""

    model_config = ConfigDict(extra="forbid")
    portal: Literal["CPPP", "WEST_BENGAL", "NTPC"]
    decision: Literal["ALLOW", "DENY", "LEGAL_VERIFY"]
    retention_decision: Literal["ALLOW", "DENY", "LEGAL_VERIFY"]
    reviewed_at: date
    policy_url: str
    reviewer: str


class CollectionLimits(BaseModel):
    """Bound polling and bind a run to its reviewed collector configuration."""

    model_config = ConfigDict(extra="forbid")
    max_polls: int = Field(ge=1)
    poll_interval_seconds: float = Field(ge=0)
    raw_directory: Path
    collector_name: str
    collector_config_version: str
    review: PortalReview


def collect_source(
    client: BrightDataScraperStudioClient,
    inputs: Sequence[Mapping[str, str]],
    clock: Callable[[], datetime],
    sleeper: Callable[[float], None],
    limits: CollectionLimits,
) -> SourceProof:
    """Run an approved collector within limits and freeze exact successful bytes."""
    if limits.review.decision != "ALLOW" or limits.review.retention_decision != "ALLOW":
        return _failure(limits, "LEGAL_VERIFY_REQUIRED")
    started_at = clock()
    try:
        snapshot = client.trigger(inputs)
    except ProviderRequestError as error:
        return _failure(limits, error.code, started_at=started_at, completed_at=clock())
    except KeyboardInterrupt:
        return _failure(limits, "INTERRUPTED", started_at=started_at, completed_at=clock())
    for poll_number in range(limits.max_polls):
        try:
            poll = client.fetch(snapshot.snapshot_id)
        except KeyboardInterrupt:
            return _failure(
                limits,
                "INTERRUPTED",
                snapshot.snapshot_id,
                started_at,
                clock(),
            )
        if isinstance(poll, SnapshotFailure):
            return _failure(
                limits,
                poll.code,
                snapshot.snapshot_id,
                started_at,
                clock(),
            )
        if isinstance(poll, SnapshotReady):
            return _complete(limits, snapshot.snapshot_id, started_at, clock(), poll)
        if poll_number + 1 < limits.max_polls:
            try:
                sleeper(limits.poll_interval_seconds)
            except KeyboardInterrupt:
                return _failure(
                    limits,
                    "INTERRUPTED",
                    snapshot.snapshot_id,
                    started_at,
                    clock(),
                )
    return _failure(
        limits,
        "POLL_TIMEOUT",
        snapshot.snapshot_id,
        started_at,
        clock(),
    )


def normalize_record(
    record: Mapping[str, JsonValue], snapshot_hash: str
) -> OpportunitySummary:
    """Validate a collector row and deterministically add frozen provenance fields."""
    raw = RawOpportunity.model_validate(record)
    stable_digest = sha256(raw.source_tender_id.encode()).hexdigest()[:12]
    return OpportunitySummary(
        **raw.model_dump(),
        id=f"{raw.source.lower()}-{stable_digest}",
        data_mode="RECORDED_BRIGHT_DATA_SNAPSHOT",
        snapshot_sha256=snapshot_hash,
    )


def _complete(
    limits: CollectionLimits,
    run_id: str,
    started_at: datetime,
    completed_at: datetime,
    poll: SnapshotReady,
) -> SourceProof:
    """Validate, persist, and prove a ready provider response or stop safely."""
    if not poll.records:
        return _failure(limits, "EMPTY_RESULT", run_id, started_at, completed_at)
    snapshot_hash = sha256(poll.raw_bytes).hexdigest()
    try:
        normalized = normalize_record(poll.records[0], snapshot_hash)
        _persist_snapshot(limits.raw_directory, snapshot_hash, poll.raw_bytes)
    except ValidationError:
        return _failure(limits, "INVALID_RECORD", run_id, started_at, completed_at)
    except OSError:
        return _failure(limits, "PERSISTENCE_FAILED", run_id, started_at, completed_at)
    return VerifiedSourceProof(
        data_mode="RECORDED_BRIGHT_DATA_SNAPSHOT",
        collector_name=limits.collector_name,
        collector_config_version=limits.collector_config_version,
        provider_run_id=run_id,
        started_at=started_at,
        completed_at=completed_at,
        raw_snapshot_sha256=snapshot_hash,
        raw_record=poll.records[0],
        normalized_record=normalized,
    )


def _persist_snapshot(directory: Path, digest: str, content: bytes) -> None:
    """Create one immutable hash-named snapshot or verify an identical existing file."""
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"{digest}.json"
    try:
        with target.open("xb") as snapshot:
            snapshot.write(content)
    except FileExistsError:
        if target.read_bytes() != content:
            raise OSError("content-addressed snapshot collision") from None


def _failure(
    limits: CollectionLimits,
    code: str,
    run_id: str | None = None,
    started_at: datetime | None = None,
    completed_at: datetime | None = None,
) -> UnavailableSourceProof:
    """Build a non-live terminal proof containing only safe failure metadata."""
    return UnavailableSourceProof(
        collector_name=limits.collector_name,
        collector_config_version=limits.collector_config_version,
        provider_run_id=run_id,
        started_at=started_at,
        completed_at=completed_at,
        failure_code=code,
    )
