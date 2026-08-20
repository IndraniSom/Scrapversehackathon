"""Offline verification for real-run source-proof artifacts."""

from datetime import datetime
from hashlib import sha256
from pathlib import Path
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    TypeAdapter,
    ValidationError,
)

from backend.contracts.source import VerifiedSourceProof
from backend.source_runs import PortalReview, normalize_record

_RECORDS = TypeAdapter(list[dict[str, JsonValue]])


class ProviderRunMetadata(BaseModel):
    """Record one non-secret provider run identifier and terminal outcome."""

    model_config = ConfigDict(extra="forbid")
    provider_run_id: str
    terminal_state: Literal["SUCCESS", "FAILURE"]
    started_at: datetime
    completed_at: datetime
    failure_code: str | None


class SourceProofArtifact(BaseModel):
    """Bind three compliant runs to one chosen exact-byte proof."""

    model_config = ConfigDict(extra="forbid")
    collector_name: str
    collector_config_version: str
    runs: list[ProviderRunMetadata] = Field(min_length=3, max_length=3)
    chosen_proof_id: str
    source_review: PortalReview
    raw_snapshot_path: str
    proof: VerifiedSourceProof


class ProofVerificationError(ValueError):
    """Indicate a safe offline proof-integrity failure."""


def verify_source_proof(path: Path) -> VerifiedSourceProof:
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
        raw_records = _RECORDS.validate_json(raw_bytes)
        normalized = normalize_record(proof.raw_record, digest)
    except ValidationError as error:
        raise ProofVerificationError("raw snapshot records are invalid") from error
    if proof.raw_record not in raw_records or normalized != proof.normalized_record:
        raise ProofVerificationError("raw and normalized records are inconsistent")
    return proof
