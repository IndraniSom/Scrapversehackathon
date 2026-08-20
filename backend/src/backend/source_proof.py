"""Offline verification for real-run source-proof artifacts."""

from hashlib import sha256
from pathlib import Path
from typing import Literal

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    model_validator,
)

from backend.contracts.source import MetadataText, StoredVerifiedSourceProof
from backend.source_policy import PortalReview, portal_calendar_date
from backend.source_provider import decode_provider_records, normalize_supported_record


class ProviderRunMetadata(BaseModel):
    """Record one non-secret provider run identifier and terminal outcome."""

    model_config = ConfigDict(extra="forbid")
    provider_run_id: MetadataText
    terminal_state: Literal["SUCCESS", "FAILURE"]
    started_at: AwareDatetime
    completed_at: AwareDatetime
    failure_code: str | None

    @model_validator(mode="after")
    def validate_outcome(self) -> "ProviderRunMetadata":
        """Require ordered aware time and failure detail only for failed runs."""
        if self.completed_at < self.started_at:
            raise ValueError("completed_at precedes started_at")
        if self.terminal_state == "SUCCESS" and self.failure_code is not None:
            raise ValueError("successful run cannot have failure_code")
        if self.terminal_state == "FAILURE" and not self.failure_code:
            raise ValueError("failed run requires failure_code")
        return self


class SourceProofArtifact(BaseModel):
    """Bind three compliant runs to one chosen exact-byte proof."""

    model_config = ConfigDict(extra="forbid")
    collector_name: MetadataText
    collector_config_version: MetadataText
    runs: list[ProviderRunMetadata] = Field(min_length=3, max_length=3)
    chosen_proof_id: MetadataText
    source_review: PortalReview
    raw_snapshot_path: str
    proof: StoredVerifiedSourceProof

    @model_validator(mode="after")
    def validate_raw_layout(self) -> "SourceProofArtifact":
        """Require the single normalized public raw path for the chosen digest."""
        expected = f"raw/{self.proof.raw_snapshot_sha256}.json"
        if self.raw_snapshot_path != expected:
            raise ValueError("raw_snapshot_path does not match required layout")
        return self


class ProofVerificationError(ValueError):
    """Indicate a safe offline proof-integrity failure."""


class FinalizationError(ValueError):
    """Report a safe staged-capture or publication gate failure."""


def verify_source_proof(path: Path) -> StoredVerifiedSourceProof:
    """Verify one proof artifact and its exact local raw bytes without network access."""
    try:
        artifact = SourceProofArtifact.model_validate_json(path.read_bytes())
        raw_path = (path.parent / artifact.raw_snapshot_path).resolve()
        if not raw_path.is_relative_to(path.parent.resolve()):
            raise ProofVerificationError("raw snapshot path escapes artifact directory")
        raw_bytes = raw_path.read_bytes()
    except (OSError, ValidationError) as error:
        raise ProofVerificationError("proof artifact is missing or invalid") from error
    proof = artifact.proof
    digest = sha256(raw_bytes).hexdigest()
    if digest != proof.raw_snapshot_sha256 or raw_path.name != f"{digest}.json":
        raise ProofVerificationError("raw snapshot hash or filename mismatch")
    if artifact.source_review.decision != "ALLOW":
        raise ProofVerificationError("source collection lacks human ALLOW")
    if artifact.source_review.retention_decision != "ALLOW":
        raise ProofVerificationError("source retention lacks human ALLOW")
    if proof.normalized_record.source != artifact.source_review.portal:
        raise ProofVerificationError("normalized source does not match approved portal")
    if artifact.source_review.reviewed_at > min(
        portal_calendar_date(run.started_at, artifact.source_review.portal)
        for run in artifact.runs
    ):
        raise ProofVerificationError("source approval postdates provider run")
    successful_ids = {
        run.provider_run_id
        for run in artifact.runs
        if run.terminal_state == "SUCCESS" and run.failure_code is None
    }
    if len(successful_ids) != 3 or artifact.chosen_proof_id not in successful_ids:
        raise ProofVerificationError("three distinct successful provider runs are required")
    if proof.provider_run_id != artifact.chosen_proof_id:
        raise ProofVerificationError("chosen proof identifier mismatch")
    chosen_run = next(
        run for run in artifact.runs if run.provider_run_id == artifact.chosen_proof_id
    )
    if (chosen_run.started_at, chosen_run.completed_at) != (
        proof.started_at,
        proof.completed_at,
    ):
        raise ProofVerificationError("chosen run timestamp mismatch")
    if (proof.collector_name, proof.collector_config_version) != (
        artifact.collector_name,
        artifact.collector_config_version,
    ):
        raise ProofVerificationError("collector metadata mismatch")
    try:
        raw_records = decode_provider_records(raw_bytes)
        normalized = normalize_supported_record(proof.raw_record, digest)
    except (ValidationError, ValueError) as error:
        raise ProofVerificationError("raw snapshot records are invalid") from error
    if proof.raw_record not in raw_records or normalized != proof.normalized_record:
        raise ProofVerificationError("raw and normalized records are inconsistent")
    return proof
