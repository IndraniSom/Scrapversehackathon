"""Closed private document selection and named change-review contracts."""

from datetime import date
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from backend.contracts.source import HttpsUrl, MetadataText, Sha256


class SelectedDocument(BaseModel):
    """Bind one private filename to official lineage and expected local facts."""

    model_config = ConfigDict(extra="forbid")
    document_version_id: MetadataText
    role: Literal["BASE_TENDER", "CORRIGENDUM"]
    local_filename: MetadataText
    source_url: HttpsUrl
    expected_sha256: Sha256
    expected_page_count: int = Field(ge=1, le=80)
    expected_text_chars: int = Field(ge=1)
    request_generated_at: AwareDatetime


class ChangeReview(BaseModel):
    """Record the named-human visual confirmation that selected clauses differ."""

    model_config = ConfigDict(extra="forbid")
    reviewer: MetadataText
    reviewed_at: date
    base_document_version_id: MetadataText
    base_physical_page_number: int = Field(ge=1)
    base_excerpt: str = Field(min_length=1, max_length=1200)
    amendment_document_version_id: MetadataText
    amendment_physical_page_number: int = Field(ge=1)
    amendment_excerpt: str = Field(min_length=1, max_length=1200)
    effective_change_confirmed: Literal[True]


class PrivateSelection(BaseModel):
    """Select exactly one official base tender and one authority corrigendum."""

    model_config = ConfigDict(extra="forbid")
    selection_version: Literal["1"]
    documents: list[SelectedDocument] = Field(min_length=2, max_length=2)
    change_review: ChangeReview
