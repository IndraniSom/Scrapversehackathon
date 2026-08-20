"""Closed staged-run records and gated proof publication."""

import json
from collections.abc import Mapping, Sequence
from datetime import datetime
from hashlib import sha256
from pathlib import Path
from typing import Literal

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    ValidationError,
    model_validator,
)

from backend.contracts.source import (
    HttpsUrl,
    MetadataText,
    NonEmpty,
    OpportunitySummary,
    Sha256,
)
from backend.source_attempts import CollectionAttemptSuccess
from backend.source_policy import PortalReview
from backend.source_storage import StorageError, atomic_install


class StagedCapture(BaseModel):
    """Describe one completed provider run retained outside demo publication paths."""

    model_config = ConfigDict(extra="forbid")
    format_version: Literal["1"] = "1"
    portal: Literal["CPPP", "NTPC"]
    provider_run_id: MetadataText
    started_at: AwareDatetime
    completed_at: AwareDatetime
    collector_name: MetadataText
    collector_config_version: MetadataText
    input_urls: list[HttpsUrl] = Field(min_length=1, max_length=10)
    review_sha256: Sha256
    raw_snapshot_sha256: Sha256
    raw_length: int = Field(gt=0)
    raw_path: NonEmpty
    raw_record: dict[str, JsonValue]
    normalized_record: OpportunitySummary

    @model_validator(mode="after")
    def validate_internal_consistency(self) -> "StagedCapture":
        """Require ordered time and the exact private raw filename for the digest."""
        if self.completed_at < self.started_at:
            raise ValueError("completed_at precedes started_at")
        if self.raw_path != f"{self.raw_snapshot_sha256}.raw.json":
            raise ValueError("raw_path does not match snapshot digest")
        if self.normalized_record.source != self.portal:
            raise ValueError("normalized source does not match capture portal")
        return self


def load_staged_capture(path: Path) -> StagedCapture:
    """Load one closed staged capture from preparation storage."""
    try:
        return StagedCapture.model_validate_json(path.read_bytes())
    except (OSError, ValidationError) as error:
        raise StorageError("staged capture is missing or invalid") from error


def stage_completed_run(
    directory: Path,
    review: PortalReview,
    inputs: Sequence[Mapping[str, str]],
    collector_name: str,
    collector_version: str,
    run_id: str,
    started_at: datetime,
    completed_at: datetime,
    raw_bytes: bytes,
    raw_record: dict[str, JsonValue],
    normalized: OpportunitySummary,
) -> CollectionAttemptSuccess:
    """Durably stage exact bytes and closed metadata outside demo publication paths."""
    digest = sha256(raw_bytes).hexdigest()
    raw_path = atomic_install(directory, f"{digest}.raw.json", raw_bytes)
    capture = StagedCapture(
        portal=review.portal,
        provider_run_id=run_id,
        started_at=started_at,
        completed_at=completed_at,
        collector_name=collector_name,
        collector_config_version=collector_version,
        input_urls=[item["url"] for item in inputs],
        review_sha256=review_digest(review),
        raw_snapshot_sha256=digest,
        raw_length=len(raw_bytes),
        raw_path=raw_path.name,
        raw_record=raw_record,
        normalized_record=normalized,
    )
    capture_bytes = (
        json.dumps(capture.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
        + "\n"
    ).encode()
    capture_name = f"capture-{sha256(run_id.encode()).hexdigest()}.json"
    capture_path = atomic_install(directory, capture_name, capture_bytes)
    return CollectionAttemptSuccess(
        capture_path=capture_path,
        provider_run_id=run_id,
        started_at=started_at,
        completed_at=completed_at,
        raw_snapshot_sha256=digest,
    )


def review_digest(review: PortalReview) -> str:
    """Hash a canonical non-secret human review for capture/finalizer correlation."""
    content = json.dumps(
        review.model_dump(mode="json"), sort_keys=True, separators=(",", ":")
    ).encode()
    return sha256(content).hexdigest()
