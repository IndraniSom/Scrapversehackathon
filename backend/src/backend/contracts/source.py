"""Closed source-collection contracts used by the preparation workflow."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, JsonValue, StringConstraints

Sha256 = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
HttpsUrl = Annotated[str, StringConstraints(pattern=r"^https://")]
NonEmpty = Annotated[str, StringConstraints(min_length=1)]
DataMode = Literal["LIVE", "RECORDED_BRIGHT_DATA_SNAPSHOT", "MANUAL_FIXTURE"]


class ClosedModel(BaseModel):
    """Reject provider fields not represented by an explicit contract."""

    model_config = ConfigDict(extra="forbid")


class SnapshotRef(ClosedModel):
    """Identify one provider collection returned by the trigger endpoint."""

    snapshot_id: NonEmpty


class TriggerResponse(ClosedModel):
    """Validate the provider's documented closed trigger response."""

    collection_id: NonEmpty


class SnapshotBuilding(ClosedModel):
    """Represent a provider snapshot that is still being assembled."""

    status: Literal["building"] = "building"


class SnapshotReady(ClosedModel):
    """Retain parsed records and the provider's exact completed response bytes."""

    status: Literal["ready"] = "ready"
    records: list[dict[str, JsonValue]]
    raw_bytes: bytes


class SnapshotFailure(ClosedModel):
    """Expose a safe terminal code without retaining provider response details."""

    status: Literal["failure"] = "failure"
    code: str


SnapshotPoll = SnapshotBuilding | SnapshotReady | SnapshotFailure


class RawOpportunity(ClosedModel):
    """Validate the exact bounded output emitted by the published collector."""

    source: Literal["CPPP", "WEST_BENGAL", "NTPC"]
    source_tender_id: NonEmpty
    reference_number: str | None
    authority: NonEmpty
    title: NonEmpty
    category: Literal[
        "CLOUD",
        "CYBERSECURITY",
        "SOFTWARE",
        "DATA_CENTER",
        "MANAGED_IT",
        "NETWORKING",
        "ERP",
        "DEVOPS",
        "OTHER",
    ]
    published_at: datetime | None
    closes_at: datetime | None
    canonical_url: HttpsUrl


class OpportunitySummary(RawOpportunity):
    """Represent one frozen API opportunity with provenance and data mode."""

    id: NonEmpty
    data_mode: DataMode
    snapshot_sha256: Sha256


class VerifiedSourceProof(ClosedModel):
    """Prove one completed provider run and its content-addressed normalization."""

    status: Literal["VERIFIED"] = "VERIFIED"
    data_mode: Literal["RECORDED_BRIGHT_DATA_SNAPSHOT"]
    collector_name: str
    collector_config_version: str
    provider_run_id: str
    started_at: datetime
    completed_at: datetime
    raw_snapshot_sha256: Sha256
    raw_record: dict[str, JsonValue]
    normalized_record: OpportunitySummary
    terminal_state: Literal["SUCCESS"] = "SUCCESS"
    failure_code: None = None


class UnavailableSourceProof(ClosedModel):
    """Represent a stopped provider workflow without fabricating source evidence."""

    status: Literal["UNAVAILABLE"] = "UNAVAILABLE"
    data_mode: Literal["MANUAL_FIXTURE"] = "MANUAL_FIXTURE"
    collector_name: str
    collector_config_version: str
    provider_run_id: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    raw_snapshot_sha256: None = None
    raw_record: None = None
    normalized_record: None = None
    terminal_state: Literal["FAILURE"] = "FAILURE"
    failure_code: str


SourceProof = VerifiedSourceProof | UnavailableSourceProof
