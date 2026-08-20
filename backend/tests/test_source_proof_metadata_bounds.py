"""Stored proof metadata bounds and public mapping tests."""

from pathlib import Path

import pytest
from pydantic import ValidationError

from backend.contracts.source import StoredVerifiedSourceProof, VerifiedSourceProof
from backend.source_proof import SourceProofArtifact
from backend.source_views import (
    build_public_verified_source_proof,
    build_verified_source_proof,
)

PROOF_PATH = Path(__file__).parents[1] / "data" / "demo" / "source-proof.json"


@pytest.mark.parametrize(
    "field", ["collector_name", "collector_config_version", "provider_run_id"]
)
def test_stored_source_proof_rejects_overlong_nested_metadata(field: str) -> None:
    """The persisted proof boundary rejects every 257-character metadata field."""
    artifact = SourceProofArtifact.model_validate_json(PROOF_PATH.read_bytes())
    values = artifact.model_dump(mode="json")
    values["proof"][field] = "x" * 257
    with pytest.raises(ValidationError):
        SourceProofArtifact.model_validate(values)


@pytest.mark.parametrize(
    "field", ["collector_name", "collector_config_version", "provider_run_id"]
)
def test_stored_source_proof_factory_rejects_overlong_metadata(field: str) -> None:
    """The finalization factory cannot construct overlong persisted metadata."""
    proof = SourceProofArtifact.model_validate_json(PROOF_PATH.read_bytes()).proof
    values = {
        "collector_name": proof.collector_name,
        "collector_config_version": proof.collector_config_version,
        "provider_run_id": proof.provider_run_id,
        "started_at": proof.started_at,
        "completed_at": proof.completed_at,
        "raw_snapshot_sha256": proof.raw_snapshot_sha256,
        "raw_record": proof.raw_record,
        "normalized_record": proof.normalized_record,
    }
    values[field] = "x" * 257
    with pytest.raises(ValidationError):
        build_verified_source_proof(**values)


def test_stored_proof_maps_explicitly_to_unbounded_public_schema() -> None:
    """Stored bounds remain internal while the complete public view matches frozen schema."""
    stored = SourceProofArtifact.model_validate_json(PROOF_PATH.read_bytes()).proof
    public = build_public_verified_source_proof(stored)
    stored_properties = StoredVerifiedSourceProof.model_json_schema()["properties"]
    public_properties = VerifiedSourceProof.model_json_schema()["properties"]
    for field in ("collector_name", "collector_config_version", "provider_run_id"):
        assert stored_properties[field]["maxLength"] == 256
        assert "maxLength" not in public_properties[field]
    assert type(stored) is StoredVerifiedSourceProof
    assert type(public) is VerifiedSourceProof
    assert public.model_dump(mode="json") == stored.model_dump(mode="json")
