"""Bounded provider polling followed by private staged capture."""

from collections.abc import Callable, Mapping, Sequence
from datetime import datetime
from hashlib import sha256
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, JsonValue, ValidationError

from backend.bright_data import BrightDataScraperStudioClient, ProviderRequestError
from backend.contracts.source import (
    MetadataText,
    OpportunitySummary,
    RawOpportunity,
    SnapshotFailure,
    SnapshotReady,
    UnavailableSourceProof,
)
from backend.source_attempts import (
    CollectionAttempt,
    CollectionAttemptFailure,
)
from backend.source_capture import stage_completed_run
from backend.source_paths import (
    SourceStorageRoots,
    StorageBoundaryError,
    repository_source_roots,
    validate_staging_directory,
)
from backend.source_policy import (
    ApprovalError,
    PortalReview,
    validate_collection_inputs,
)
from backend.source_storage import StorageError
from backend.source_views import build_unavailable_source_proof


class CollectionLimits(BaseModel):
    """Bound polling and bind a run to reviewed private staging storage."""

    model_config = ConfigDict(extra="forbid")
    max_polls: int = Field(default=36, ge=1, le=120)
    poll_interval_seconds: float = Field(default=5, ge=0, le=60)
    staging_directory: Path
    storage_roots: SourceStorageRoots = Field(default_factory=repository_source_roots)
    collector_name: MetadataText
    collector_config_version: MetadataText
    review: PortalReview


def collect_source(
    client: BrightDataScraperStudioClient,
    inputs: Sequence[Mapping[str, str]],
    clock: Callable[[], datetime],
    sleeper: Callable[[float], None],
    limits: CollectionLimits,
) -> CollectionAttempt:
    """Validate approval, run within bounds, and stage one completed capture privately."""
    started_at = clock()
    try:
        validate_staging_directory(limits.staging_directory, limits.storage_roots)
        validated = validate_collection_inputs(inputs, limits.review, started_at)
    except (ApprovalError, StorageBoundaryError):
        return _failure("LEGAL_VERIFY_REQUIRED")
    try:
        snapshot = client.trigger(validated)
    except ProviderRequestError as error:
        return _failure(error.code, started_at=started_at, completed_at=clock())
    except KeyboardInterrupt:
        return _failure("INTERRUPTED", started_at=started_at, completed_at=clock())
    for poll_number in range(limits.max_polls):
        try:
            poll = client.fetch(snapshot.snapshot_id)
        except KeyboardInterrupt:
            return _failure("INTERRUPTED", snapshot.snapshot_id, started_at, clock())
        if isinstance(poll, SnapshotFailure):
            return _failure(poll.code, snapshot.snapshot_id, started_at, clock())
        if isinstance(poll, SnapshotReady):
            return _stage_ready(
                limits, validated, snapshot.snapshot_id, started_at, clock(), poll
            )
        if poll_number + 1 < limits.max_polls:
            try:
                sleeper(limits.poll_interval_seconds)
            except KeyboardInterrupt:
                return _failure("INTERRUPTED", snapshot.snapshot_id, started_at, clock())
    return _failure("POLL_TIMEOUT", snapshot.snapshot_id, started_at, clock())


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


def unavailable_source_view(reason_code: str) -> UnavailableSourceProof:
    """Map internal diagnostics to one safe frozen unavailable API branch."""
    allowed = {
        "NOT_CONFIGURED",
        "LEGAL_VERIFY_REQUIRED",
        "PROVIDER_UNAVAILABLE",
        "PROOF_NOT_CAPTURED",
    }
    reason = reason_code if reason_code in allowed else "PROVIDER_UNAVAILABLE"
    return build_unavailable_source_proof(reason)


def _stage_ready(
    limits: CollectionLimits,
    inputs: Sequence[Mapping[str, str]],
    run_id: str,
    started_at: datetime,
    completed_at: datetime,
    poll: SnapshotReady,
) -> CollectionAttempt:
    """Normalize one ready result and atomically stage its exact response and metadata."""
    if not poll.records:
        return _failure("EMPTY_RESULT", run_id, started_at, completed_at)
    digest = sha256(poll.raw_bytes).hexdigest()
    try:
        normalized = normalize_record(poll.records[0], digest)
        return stage_completed_run(
            limits.staging_directory,
            limits.review,
            inputs,
            limits.collector_name,
            limits.collector_config_version,
            run_id,
            started_at,
            completed_at,
            poll.raw_bytes,
            poll.records[0],
            normalized,
        )
    except ValidationError:
        return _failure("INVALID_RECORD", run_id, started_at, completed_at)
    except StorageError:
        return _failure("PERSISTENCE_FAILED", run_id, started_at, completed_at)
    except KeyboardInterrupt:
        return _failure("INTERRUPTED", run_id, started_at, completed_at)


def _failure(
    code: str,
    run_id: str | None = None,
    started_at: datetime | None = None,
    completed_at: datetime | None = None,
) -> CollectionAttemptFailure:
    """Build separately named safe internal collection diagnostics."""
    return CollectionAttemptFailure(
        failure_code=code,
        provider_run_id=run_id,
        started_at=started_at,
        completed_at=completed_at,
    )
