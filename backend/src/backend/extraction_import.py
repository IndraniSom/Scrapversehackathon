"""Network-free response import, human review gate, and bounded cached artifacts."""

import json
from datetime import date
from pathlib import Path
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, ValidationError

from backend.contracts.extraction import (
    ExtractionEnvelope,
    ExtractionRequestArtifact,
    ExtractionSelection,
    ProposedExtraction,
    VerifiedExtraction,
)
from backend.contracts.source import MetadataText, Sha256
from backend.documents import DocumentError, DocumentLimits, ParsedDocument, parse_pdf
from backend.extraction import ExtractionError, verify_extraction
from backend.extraction_requests import request_payload_sha256
from backend.source_storage import StorageError, atomic_install


class ExtractionImportError(ValueError):
    """Report safe request, response, review, or cache validation failure."""


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


def import_response_files(
    request_path: Path,
    response_path: Path,
    review_path: Path,
    pdf_path: Path,
    output_path: Path,
) -> Path:
    """Validate all private inputs before atomically writing one bounded cache."""
    try:
        request = ExtractionRequestArtifact.model_validate_json(request_path.read_bytes())
        response = ExtractionEnvelope.model_validate_json(response_path.read_bytes())
        review = HumanExtractionReview.model_validate_json(review_path.read_bytes())
        document = parse_pdf(pdf_path, DocumentLimits())
        cached = _validate_import(request, response, review, document)
        content = (
            json.dumps(cached.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
            + "\n"
        ).encode()
        return atomic_install(output_path.parent, output_path.name, content)
    except ExtractionImportError:
        raise
    except (DocumentError, ExtractionError, OSError, StorageError, ValidationError) as error:
        raise ExtractionImportError("response import validation failed") from error


def verify_cached_extraction(path: Path) -> CachedExtraction:
    """Validate one bounded cached extraction without PDF, network, or credentials."""
    try:
        cached = CachedExtraction.model_validate_json(path.read_bytes())
    except (OSError, ValidationError) as error:
        raise ExtractionImportError("cached extraction is missing or invalid") from error
    page_numbers = [item.physical_page_number for item in cached.page_inventory]
    proposal = cached.verified.proposal
    if (
        proposal.document_sha256 != cached.document_sha256
        or proposal.processed_page_numbers != page_numbers
        or cached.verified.review_state != cached.review_state
        or proposal.review_state != cached.review_state
    ):
        raise ExtractionImportError("cached extraction metadata is inconsistent")
    return cached


def verify_extraction_directory(directory: Path) -> list[CachedExtraction]:
    """Require one offline-valid base and one offline-valid corrigendum cache."""
    paths = [directory / "base.json", directory / "amendment.json"]
    if not all(path.is_file() for path in paths):
        raise ExtractionImportError("base and amendment extraction caches are required")
    cached = [verify_cached_extraction(path) for path in paths]
    if {item.document.role for item in cached} != {"BASE_TENDER", "CORRIGENDUM"}:
        raise ExtractionImportError("cached extraction roles are incomplete")
    return cached


def _validate_import(
    request: ExtractionRequestArtifact,
    response: ExtractionEnvelope,
    review: HumanExtractionReview,
    document: ParsedDocument,
) -> CachedExtraction:
    """Correlate request/response/document/review and perform local excerpt verification."""
    payload = request.request
    if request.request_sha256 != request_payload_sha256(payload):
        raise ExtractionImportError("request payload hash mismatch")
    metadata_pairs = (
        (response.request_sha256, request.request_sha256),
        (response.provider, payload.provider),
        (response.model, payload.model),
        (response.prompt_version, payload.prompt_version),
        (response.prompt_sha256, payload.prompt_sha256),
        (response.schema_version, payload.schema_version),
    )
    if any(actual != expected for actual, expected in metadata_pairs):
        raise ExtractionImportError("response metadata does not match request")
    if response.output is None:
        raise ExtractionImportError("provider did not return extraction output")
    if (
        payload.document_sha256 != document.document_sha256
        or response.output.document_sha256 != document.document_sha256
        or review.document_sha256 != document.document_sha256
        or review.revision != response.output.revision
    ):
        raise ExtractionImportError("document or revision metadata mismatch")
    if (
        review.review_state not in {"HUMAN_CONFIRMED", "HUMAN_EDITED"}
        or not review.evidence_confirmed
        or (payload.document.role == "CORRIGENDUM" and not review.authority_confirmed)
    ):
        raise ExtractionImportError("independent human review did not pass")
    reviewed = ProposedExtraction.model_validate(
        response.output.model_dump() | {"review_state": review.review_state}
    )
    verified = verify_extraction(document, reviewed)
    return CachedExtraction(
        document=payload.document,
        document_sha256=document.document_sha256,
        physical_page_count=document.physical_page_count,
        page_inventory=[
            CachedPage(
                physical_page_number=page.physical_page_number,
                normalized_text_sha256=page.normalized_text_sha256,
            )
            for page in document.pages
        ],
        request_sha256=request.request_sha256,
        provider=response.provider,
        model=response.model,
        prompt_version=response.prompt_version,
        prompt_sha256=response.prompt_sha256,
        schema_version=response.schema_version,
        generated_at=response.generated_at,
        verified=verified,
        reviewer=review.reviewer,
        reviewed_at=review.reviewed_at,
        review_state=review.review_state,
    )
