"""Closed independent review and bounded cached extraction contracts."""

from datetime import date
from typing import Literal

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)

from backend.contracts.extraction import ExtractionSelection, VerifiedExtraction
from backend.contracts.source import MetadataText, Sha256


class HumanExtractionReview(BaseModel):
    """Record independent human confirmation for one document revision."""

    model_config = ConfigDict(extra="forbid")
    reviewer: MetadataText
    reviewed_at: date
    document_sha256: Sha256
    revision: int = Field(ge=1)
    review_state: Literal["HUMAN_CONFIRMED", "HUMAN_EDITED", "HUMAN_REJECTED"]
    evidence_confirmed: bool
    authority_confirmed: bool


class CachedPage(BaseModel):
    """Retain only one-based page identity and normalized text hash, never full text."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    physical_page_number: int = Field(ge=1)
    normalized_text_sha256: Sha256


class CachedExtraction(BaseModel):
    """Retain verified bounded extraction, lineage, model metadata, and page inventory."""

    model_config = ConfigDict(extra="forbid")
    document: ExtractionSelection
    document_sha256: Sha256
    physical_page_count: int = Field(ge=1)
    page_inventory: list[CachedPage] = Field(min_length=1)
    request_sha256: Sha256
    provider: Literal["DEEPSEEK"]
    model: MetadataText
    prompt_version: MetadataText
    prompt_sha256: Sha256
    schema_version: MetadataText
    generated_at: AwareDatetime
    verified: VerifiedExtraction
    reviewer: MetadataText
    reviewed_at: date
    review_state: Literal["HUMAN_CONFIRMED", "HUMAN_EDITED"]

    @model_validator(mode="after")
    def validate_page_inventory(self) -> "CachedExtraction":
        """Require exactly one ordered page hash for every selected physical page."""
        numbers = [item.physical_page_number for item in self.page_inventory]
        if numbers != list(range(1, self.physical_page_count + 1)):
            raise ValueError("page inventory must be complete ordered physical pages")
        return self
