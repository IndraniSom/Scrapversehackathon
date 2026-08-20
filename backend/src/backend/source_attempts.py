"""Internal diagnostics for collection attempts before public proof mapping."""

from pathlib import Path
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, model_validator

from backend.contracts.source import MetadataText, NonEmpty, Sha256


class CollectionAttemptFailure(BaseModel):
    """Retain safe internal failure diagnostics without shaping an API response."""

    model_config = ConfigDict(extra="forbid")
    status: Literal["FAILURE"] = "FAILURE"
    data_mode: Literal["MANUAL_FIXTURE"] = "MANUAL_FIXTURE"
    failure_code: NonEmpty
    provider_run_id: MetadataText | None = None
    started_at: AwareDatetime | None = None
    completed_at: AwareDatetime | None = None


class CollectionAttemptSuccess(BaseModel):
    """Point to one validated non-secret capture in preparation storage."""

    model_config = ConfigDict(extra="forbid")
    status: Literal["SUCCESS"] = "SUCCESS"
    data_mode: Literal["RECORDED_BRIGHT_DATA_SNAPSHOT"] = (
        "RECORDED_BRIGHT_DATA_SNAPSHOT"
    )
    capture_path: Path
    provider_run_id: MetadataText
    started_at: AwareDatetime
    completed_at: AwareDatetime
    raw_snapshot_sha256: Sha256

    @model_validator(mode="after")
    def validate_chronology(self) -> "CollectionAttemptSuccess":
        """Reject a staged run whose completion precedes its start."""
        if self.completed_at < self.started_at:
            raise ValueError("completed_at precedes started_at")
        return self


CollectionAttempt = CollectionAttemptSuccess | CollectionAttemptFailure
