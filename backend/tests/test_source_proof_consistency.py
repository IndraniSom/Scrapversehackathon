"""Cross-field verified source-proof consistency regressions."""

from pathlib import Path

import pytest
from pydantic import ValidationError

from backend.contracts.source import StoredVerifiedSourceProof, VerifiedSourceProof
from backend.source_proof import SourceProofArtifact

PROOF_PATH = Path(__file__).parents[1] / "data" / "demo" / "source-proof.json"


def proof_values() -> dict[str, object]:
    """Load the real proof branch as independently mutable JSON-compatible values."""
    artifact = SourceProofArtifact.model_validate_json(PROOF_PATH.read_bytes())
    return artifact.proof.model_dump(mode="json")


@pytest.mark.parametrize("model", [VerifiedSourceProof, StoredVerifiedSourceProof])
def test_verified_proof_requires_recorded_normalized_mode(model: type[VerifiedSourceProof]) -> None:
    """A VERIFIED branch cannot contain a manual normalized opportunity."""
    values = proof_values()
    normalized = values["normalized_record"]
    assert isinstance(normalized, dict)
    normalized["data_mode"] = "MANUAL_FIXTURE"
    with pytest.raises(ValidationError):
        model.model_validate(values)


@pytest.mark.parametrize("model", [VerifiedSourceProof, StoredVerifiedSourceProof])
def test_verified_proof_requires_matching_nested_snapshot_hash(
    model: type[VerifiedSourceProof],
) -> None:
    """A VERIFIED branch cannot normalize a record from unrelated raw bytes."""
    values = proof_values()
    normalized = values["normalized_record"]
    assert isinstance(normalized, dict)
    normalized["snapshot_sha256"] = "e" * 64
    with pytest.raises(ValidationError):
        model.model_validate(values)
