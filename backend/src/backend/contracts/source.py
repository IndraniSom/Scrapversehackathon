"""Closed source-collection contracts used by the preparation workflow."""

from typing import Annotated, Literal

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    field_validator,
    model_validator,
)

from backend.contracts.scalars import (
    DataMode,
    HttpsUrl,
    JsonObject,
    NonEmpty,
    OpportunityId,
    Sha256,
)
from backend.contracts.scalars import MetadataText as ScalarMetadataText

MetadataText = ScalarMetadataText


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

    status: Literal["building"]


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

    source: Literal["CPPP", "WEST_BENGAL", "NTPC", "ODISHA"]
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
    published_at: AwareDatetime | None
    closes_at: AwareDatetime | None
    canonical_url: HttpsUrl

    @field_validator("source_tender_id")
    @classmethod
    def reject_dot_segment_id(cls, value: str) -> str:
        """Reject identifiers that collapse as URL dot-segment route components."""
        if value in {".", ".."}:
            raise ValueError("source_tender_id cannot be a dot segment")
        return value


class OpportunitySummary(RawOpportunity):
    """Represent one frozen API opportunity with provenance and data mode."""

    id: OpportunityId
    data_mode: DataMode
    snapshot_sha256: Sha256

    @field_validator("id")
    @classmethod
    def reject_dot_segment_route_id(cls, value: str) -> str:
        """Reject literal dot segments forbidden by the frozen route contract."""
        if value in {".", ".."}:
            raise ValueError("id cannot be a dot segment")
        return value


class VerifiedSourceProof(ClosedModel):
    """Prove one completed provider run and its content-addressed normalization."""

    status: Literal["VERIFIED"]
    data_mode: Literal["RECORDED_BRIGHT_DATA_SNAPSHOT"]
    reason_code: None
    collector_name: NonEmpty
    collector_config_version: NonEmpty
    provider_run_id: NonEmpty
    started_at: AwareDatetime
    completed_at: AwareDatetime
    raw_snapshot_sha256: Sha256
    raw_record: JsonObject
    normalized_record: OpportunitySummary
    terminal_state: Literal["SUCCESS"]
    failure_code: None

    @model_validator(mode="after")
    def validate_chronology(self) -> "VerifiedSourceProof":
        """Reject a provider run that completes before it starts."""
        if self.completed_at < self.started_at:
            raise ValueError("completed_at precedes started_at")
        return self


class StoredVerifiedSourceProof(VerifiedSourceProof):
    """Persist verified proof metadata with the internal 256-character bounds."""

    collector_name: MetadataText
    collector_config_version: MetadataText
    provider_run_id: MetadataText


class UnavailableSourceProof(ClosedModel):
    """Represent a stopped provider workflow without fabricating source evidence."""

    status: Literal["UNAVAILABLE"]
    data_mode: Literal["MANUAL_FIXTURE"]
    reason_code: Literal[
        "NOT_CONFIGURED",
        "LEGAL_VERIFY_REQUIRED",
        "PROVIDER_UNAVAILABLE",
        "PROOF_NOT_CAPTURED",
    ]
    collector_name: None
    collector_config_version: None
    provider_run_id: None
    started_at: None
    completed_at: None
    raw_snapshot_sha256: None
    raw_record: None
    normalized_record: None
    terminal_state: None
    failure_code: None


SourceProof = Annotated[
    VerifiedSourceProof | UnavailableSourceProof,
    Field(discriminator="status"),
]
