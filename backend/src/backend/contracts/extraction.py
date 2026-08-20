"""Closed provider-independent extraction request and response contracts."""

from typing import Literal

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    JsonValue,
    model_validator,
)

from backend.contracts.rules import AuthorityProposal, ProposedRuleGroup
from backend.contracts.source import HttpsUrl, MetadataText, Sha256
from backend.documents import PageText


class ClosedExtractionModel(BaseModel):
    """Reject fields outside the preparation-time extraction contract."""

    model_config = ConfigDict(extra="forbid")


class ExtractionSelection(ClosedExtractionModel):
    """Bind one private local document to its official lineage and role."""

    document_version_id: MetadataText
    role: Literal["BASE_TENDER", "CORRIGENDUM"]
    source_url: HttpsUrl


class ExtractionRequestConfig(ClosedExtractionModel):
    """Freeze provider-independent model, prompt, and schema identifiers."""

    provider: Literal["DEEPSEEK"] = "DEEPSEEK"
    model: Literal["deepseek-v4-flash"] = "deepseek-v4-flash"
    prompt_version: Literal["ocac-v1"] = "ocac-v1"
    schema_version: Literal["rules-v1"] = "rules-v1"


class ExtractionRequest(ClosedExtractionModel):
    """Carry every page as untrusted data plus a closed tool-free schema request."""

    provider: Literal["DEEPSEEK"]
    model: MetadataText
    prompt_version: MetadataText
    prompt_sha256: Sha256
    schema_version: MetadataText
    generated_at: AwareDatetime
    document: ExtractionSelection
    document_sha256: Sha256
    instructions: str
    tools: list[JsonValue]
    pages: list[PageText]
    output_schema: dict[str, JsonValue]

    @model_validator(mode="after")
    def validate_tool_free(self) -> "ExtractionRequest":
        """Reject any request that exposes a model tool surface."""
        if self.tools:
            raise ValueError("extraction requests must not contain tools")
        return self


class ExtractionRequestArtifact(ClosedExtractionModel):
    """Bind a canonical request hash to its complete network-free payload."""

    request_sha256: Sha256
    request: ExtractionRequest


class ProposedExtraction(ClosedExtractionModel):
    """Represent a closed provider proposal before local evidence verification."""

    document_sha256: Sha256
    processed_page_numbers: list[int]
    revision: int
    extraction_state: Literal["PROPOSED"]
    review_state: Literal[
        "UNREVIEWED", "HUMAN_CONFIRMED", "HUMAN_REJECTED", "HUMAN_EDITED"
    ]
    requirements: ProposedRuleGroup
    authority_statement: AuthorityProposal | None


class VerifiedExtraction(ClosedExtractionModel):
    """Retain an evidence-located proposal that remains policy UNKNOWN until review."""

    proposal: ProposedExtraction
    extraction_state: Literal["EVIDENCE_VERIFIED"]
    review_state: Literal[
        "UNREVIEWED", "HUMAN_CONFIRMED", "HUMAN_REJECTED", "HUMAN_EDITED"
    ]
    decision_state: Literal["UNKNOWN"]


class ExtractionEnvelope(ClosedExtractionModel):
    """Represent one closed provider response or safe refusal/failure."""

    request_sha256: Sha256
    provider: Literal["DEEPSEEK"]
    model: MetadataText
    prompt_version: MetadataText
    prompt_sha256: Sha256
    schema_version: MetadataText
    generated_at: AwareDatetime
    output: ProposedExtraction | None
    refusal: str | None
    failure_code: str | None

    @model_validator(mode="after")
    def validate_outcome(self) -> "ExtractionEnvelope":
        """Require exactly one successful output, refusal, or provider failure."""
        outcomes = sum(
            value is not None for value in (self.output, self.refusal, self.failure_code)
        )
        if outcomes != 1:
            raise ValueError("envelope requires exactly one outcome")
        return self
