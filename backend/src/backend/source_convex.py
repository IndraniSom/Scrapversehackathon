"""Network-free import of closed Convex provider export artifacts."""

import base64
import binascii
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from pathlib import Path

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    TypeAdapter,
    ValidationError,
)

from backend.contracts.source import MetadataText, OpportunitySummary, Sha256
from backend.source_capture import stage_completed_run
from backend.source_paths import (
    SourceStorageRoots,
    validate_staging_directory,
)
from backend.source_policy import PortalReview, validate_collection_inputs
from backend.source_provider import (
    NtpcProviderRecord,
    decode_provider_records,
    normalize_provider_record,
)
from backend.source_storage import StorageError

_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


class ConvexImportError(ValueError):
    """Report a safe export-pair validation or staging failure."""


class SnapshotExport(BaseModel):
    """Validate one non-secret provider export and its exact encoded bytes."""

    model_config = ConfigDict(extra="forbid")
    provider_id: MetadataText = Field(alias="providerId")
    raw_base64: str = Field(alias="rawBase64")
    sha256: Sha256


class ReadyRunMetadata(BaseModel):
    """Validate one Convex run's non-secret terminal metadata."""

    model_config = ConfigDict(extra="forbid")
    provider_run_id: MetadataText
    started_at_ms: int = Field(ge=0)
    completed_at_ms: int = Field(ge=0)
    raw_snapshot_sha256: Sha256
    collector_name: MetadataText
    collector_version: MetadataText


@dataclass(frozen=True, slots=True)
class PreparedCapture:
    """Hold one fully validated pair until every pair passes before staging."""

    metadata: ReadyRunMetadata
    started_at: datetime
    completed_at: datetime
    raw_bytes: bytes
    raw_record: dict[str, JsonValue]
    normalized: OpportunitySummary
    input_url: str


def import_convex_exports(
    exports_path: Path,
    metadata_path: Path,
    review_path: Path,
    staging_directory: Path,
    storage_roots: SourceStorageRoots,
) -> list[Path]:
    """Validate exactly three paired exports before staging any capture."""
    try:
        validate_staging_directory(staging_directory, storage_roots)
        exports = TypeAdapter(list[SnapshotExport]).validate_json(exports_path.read_bytes())
        metadata = TypeAdapter(list[ReadyRunMetadata]).validate_json(
            metadata_path.read_bytes()
        )
        review = PortalReview.model_validate_json(review_path.read_bytes())
        prepared = _prepare_pairs(exports, metadata, review)
    except ConvexImportError:
        raise
    except (OSError, ValidationError, ValueError) as error:
        raise ConvexImportError("Convex import inputs are missing or invalid") from error
    paths: list[Path] = []
    try:
        for item in prepared:
            attempt = stage_completed_run(
                staging_directory,
                review,
                [{"url": item.input_url}],
                item.metadata.collector_name,
                item.metadata.collector_version,
                item.metadata.provider_run_id,
                item.started_at,
                item.completed_at,
                item.raw_bytes,
                item.raw_record,
                item.normalized,
            )
            paths.append(attempt.capture_path)
    except (StorageError, ValidationError) as error:
        raise ConvexImportError("validated capture staging failed") from error
    return paths


def _prepare_pairs(
    exports: list[SnapshotExport],
    metadata: list[ReadyRunMetadata],
    review: PortalReview,
) -> list[PreparedCapture]:
    """Cross-check all export/metadata pairs and return write-free prepared captures."""
    if len(exports) != 3 or len(metadata) != 3:
        raise ConvexImportError("exactly three export and metadata rows are required")
    export_by_id = {item.provider_id: item for item in exports}
    metadata_by_id = {item.provider_run_id: item for item in metadata}
    if (
        len(export_by_id) != 3
        or len(metadata_by_id) != 3
        or set(export_by_id) != set(metadata_by_id)
    ):
        raise ConvexImportError("provider IDs are not three distinct matching pairs")
    if len({(item.collector_name, item.collector_version) for item in metadata}) != 1:
        raise ConvexImportError("collector metadata differs across runs")
    return [
        _prepare_pair(export_by_id[run_id], metadata_by_id[run_id], review)
        for run_id in metadata_by_id
    ]


def _prepare_pair(
    export: SnapshotExport,
    metadata: ReadyRunMetadata,
    review: PortalReview,
) -> PreparedCapture:
    """Validate one exact byte set, run chronology, record shape, input, and review."""
    try:
        raw_bytes = base64.b64decode(export.raw_base64, validate=True)
    except (binascii.Error, ValueError) as error:
        raise ConvexImportError("rawBase64 is invalid") from error
    digest = sha256(raw_bytes).hexdigest()
    if digest != export.sha256 or digest != metadata.raw_snapshot_sha256:
        raise ConvexImportError("raw snapshot hashes do not match")
    if metadata.completed_at_ms < metadata.started_at_ms:
        raise ConvexImportError("run completion precedes start")
    started_at = _EPOCH + timedelta(milliseconds=metadata.started_at_ms)
    completed_at = _EPOCH + timedelta(milliseconds=metadata.completed_at_ms)
    try:
        records = decode_provider_records(raw_bytes)
        raw_record = records[0]
        provider = NtpcProviderRecord.model_validate(raw_record)
        validate_collection_inputs([{"url": provider.input.url}], review, started_at)
        normalized = normalize_provider_record(raw_record, digest)
    except (ValidationError, ValueError) as error:
        raise ConvexImportError("provider response or approval is invalid") from error
    return PreparedCapture(
        metadata=metadata,
        started_at=started_at,
        completed_at=completed_at,
        raw_bytes=raw_bytes,
        raw_record=raw_record,
        normalized=normalized,
        input_url=provider.input.url,
    )
