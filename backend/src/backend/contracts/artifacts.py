"""Closed immutable demo manifest and loaded bundle contracts."""

from pydantic import AwareDatetime, Field, model_validator

from backend.contracts.cache import CachedExtraction
from backend.contracts.evaluation import ClosedEvaluationModel, CompanyProfile
from backend.contracts.source import NonEmpty, Sha256, StoredVerifiedSourceProof
from backend.contracts.views import AmendmentImpactView, AssessmentView, OpportunityList
from backend.source_proof import SourceProofArtifact

ARTIFACT_KEYS = {
    "opportunities",
    "source_proof",
    "raw_snapshot",
    "base_extraction",
    "amendment_extraction",
    "company",
    "assessment",
    "impact",
}


class ArtifactRef(ClosedEvaluationModel):
    """Bind one contained relative path to the SHA-256 of its exact bytes."""

    path: NonEmpty
    sha256: Sha256


class DemoManifest(ClosedEvaluationModel):
    """Declare every immutable demo input/output and the assessment instant."""

    version: str = Field(pattern=r"^1$")
    opportunity_id: NonEmpty
    assessment_as_of: AwareDatetime
    files: dict[str, ArtifactRef]

    @model_validator(mode="after")
    def validate_file_keys(self) -> "DemoManifest":
        """Require the exact closed artifact set without omissions or extras."""
        if self.files.keys() != ARTIFACT_KEYS:
            raise ValueError("manifest artifact keys are incomplete")
        return self


class DemoBundle(ClosedEvaluationModel):
    """Hold one fully hash-verified and recomputed runtime bundle."""

    manifest: DemoManifest
    opportunities: OpportunityList
    source_proof: SourceProofArtifact
    verified_proof: StoredVerifiedSourceProof
    base_extraction: CachedExtraction
    amendment_extraction: CachedExtraction
    company: CompanyProfile
    assessment: AssessmentView
    impact: AmendmentImpactView
