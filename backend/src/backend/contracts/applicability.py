"""Reviewed evidence and operator-discriminated applicability contracts."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from backend.contracts.source import HttpsUrl, NonEmpty, Sha256

NonBlankApplicabilityValue = Annotated[
    str, StringConstraints(min_length=1, pattern=r".*\S.*")
]


class ClosedApplicabilityModel(BaseModel):
    """Reject fields outside applicability and reviewed-evidence contracts."""

    model_config = ConfigDict(extra="forbid")


class EvidenceSpan(ClosedApplicabilityModel):
    """Carry one bounded reviewed clause with complete document provenance."""

    source_url: HttpsUrl
    source_snapshot_sha256: Sha256
    document_sha256: Sha256
    document_version_id: NonEmpty
    physical_page_number: int = Field(ge=1)
    printed_page_label: str | None
    section_heading: NonEmpty
    excerpt: str = Field(min_length=1, max_length=1200)
    normalized_page_text_sha256: Sha256
    extraction_model: NonEmpty
    extraction_prompt_version: NonEmpty
    extraction_schema_version: NonEmpty
    extraction_state: Literal["PROPOSED", "EVIDENCE_VERIFIED", "INVALID"]
    review_state: Literal[
        "UNREVIEWED", "HUMAN_CONFIRMED", "HUMAN_REJECTED", "HUMAN_EDITED"
    ]


class ApplicabilityEquals(ClosedApplicabilityModel):
    """Compare one supported company field with one exact string."""

    field: NonEmpty
    operator: Literal["EQUALS"]
    expected_value: NonBlankApplicabilityValue
    evidence: EvidenceSpan


class ApplicabilityIn(ClosedApplicabilityModel):
    """Compare one supported company field with unique candidate strings."""

    field: NonEmpty
    operator: Literal["IN"]
    expected_value: list[NonBlankApplicabilityValue] = Field(
        min_length=1, json_schema_extra={"uniqueItems": True}
    )
    evidence: EvidenceSpan

    @model_validator(mode="after")
    def validate_unique_values(self) -> "ApplicabilityIn":
        """Reject duplicate candidates that make membership evidence ambiguous."""
        if len(self.expected_value) != len(set(self.expected_value)):
            raise ValueError("IN expected values must be unique")
        return self


class ApplicabilityExists(ClosedApplicabilityModel):
    """Require one supported company field to contain a known value."""

    field: NonEmpty
    operator: Literal["EXISTS"]
    expected_value: None
    evidence: EvidenceSpan


type ApplicabilityCondition = Annotated[
    ApplicabilityEquals | ApplicabilityIn | ApplicabilityExists,
    Field(discriminator="operator"),
]
