"""Network-free response import, human review gate, and bounded cached artifacts."""

import json
from pathlib import Path

from pydantic import ValidationError

from backend.contracts.cache import (
    CachedExtraction,
    CachedPage,
    HumanExtractionReview,
)
from backend.contracts.extraction import (
    ExtractionEnvelope,
    ExtractionRequestArtifact,
    ProposedExtraction,
)
from backend.contracts.selection import PrivateSelection, SelectedDocument
from backend.documents import DocumentError, ParsedDocument
from backend.extraction import ExtractionError, verify_extraction
from backend.extraction_lineage import (
    ExtractionLineageError,
    validate_cache_lineage,
    validate_import_lineage,
    validate_review_chronology,
)
from backend.extraction_paths import (
    ExtractionCachePathError,
    extraction_output_for_role,
    validate_extraction_output,
)
from backend.extraction_verification import iter_proposed_evidence
from backend.preparation import PreparationError, rebuild_request_from_selection
from backend.source_storage import StorageError, atomic_install


class ExtractionImportError(ValueError):
    """Report safe request, response, review, or cache validation failure."""


def import_response_files(
    selection_path: Path,
    request_path: Path,
    response_path: Path,
    review_path: Path,
    pdf_path: Path,
) -> Path:
    """Rebuild authority and atomically write only its canonical role-derived cache."""
    try:
        selection, selected, document, authoritative = rebuild_request_from_selection(
            selection_path, pdf_path
        )
        request = ExtractionRequestArtifact.model_validate_json(request_path.read_bytes())
        response = ExtractionEnvelope.model_validate_json(response_path.read_bytes())
        review = HumanExtractionReview.model_validate_json(review_path.read_bytes())
        cached = _validate_import(
            authoritative, request, response, review, document, selection, selected
        )
        output = extraction_output_for_role(selected.role)
        validate_extraction_output(output, selected.role)
        content = (
            json.dumps(cached.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
            + "\n"
        ).encode()
        return atomic_install(output.parent, output.name, content)
    except ExtractionImportError:
        raise
    except (
        DocumentError,
        ExtractionCachePathError,
        ExtractionLineageError,
        ExtractionError,
        OSError,
        PreparationError,
        StorageError,
        ValidationError,
    ) as error:
        raise ExtractionImportError("response import validation failed") from error


def verify_cached_extraction(path: Path) -> CachedExtraction:
    """Validate one bounded cached extraction without PDF, network, or credentials."""
    try:
        cached = CachedExtraction.model_validate_json(path.read_bytes())
    except (OSError, ValidationError) as error:
        raise ExtractionImportError("cached extraction is missing or invalid") from error
    page_numbers = [item.physical_page_number for item in cached.page_inventory]
    proposal = cached.verified.proposal
    evidence_pages = {
        item.physical_page_number for item in iter_proposed_evidence(proposal)
    }
    if (
        proposal.document_sha256 != cached.document_sha256
        or proposal.processed_page_numbers != page_numbers
        or not evidence_pages.issubset(set(page_numbers))
        or cached.verified.review_state != cached.review_state
        or proposal.review_state != cached.review_state
    ):
        raise ExtractionImportError("cached extraction metadata is inconsistent")
    return cached


def verify_extraction_directory(directory: Path) -> list[CachedExtraction]:
    """Verify fixed base/amendment caches and their authority/revision lineage."""
    base_path = directory / "base.json"
    amendment_path = directory / "amendment.json"
    if not base_path.is_file() or not amendment_path.is_file():
        raise ExtractionImportError("base and amendment extraction caches are required")
    base = verify_cached_extraction(base_path)
    amendment = verify_cached_extraction(amendment_path)
    try:
        validate_cache_lineage(base, amendment)
    except ExtractionLineageError as error:
        raise ExtractionImportError(str(error)) from error
    return [base, amendment]


def _validate_import(
    authoritative: ExtractionRequestArtifact,
    request: ExtractionRequestArtifact,
    response: ExtractionEnvelope,
    review: HumanExtractionReview,
    document: ParsedDocument,
    selection: PrivateSelection,
    selected: SelectedDocument,
) -> CachedExtraction:
    """Correlate rebuilt request, response chronology, document lineage, and review."""
    if request != authoritative:
        raise ExtractionImportError("request does not match PDF-derived authority")
    payload = authoritative.request
    metadata_pairs = (
        (response.request_sha256, authoritative.request_sha256),
        (response.provider, payload.provider),
        (response.model, payload.model),
        (response.prompt_version, payload.prompt_version),
        (response.prompt_sha256, payload.prompt_sha256),
        (response.schema_version, payload.schema_version),
    )
    if any(actual != expected for actual, expected in metadata_pairs):
        raise ExtractionImportError("response metadata does not match request")
    if response.generated_at < payload.generated_at or response.output is None:
        raise ExtractionImportError("response chronology or output is invalid")
    validate_review_chronology(review.reviewed_at, response.generated_at)
    output = response.output
    if output.review_state != "UNREVIEWED":
        raise ExtractionImportError("provider output cannot claim human review")
    if (
        output.document_sha256 != document.document_sha256
        or review.document_sha256 != document.document_sha256
        or review.revision != output.revision
    ):
        raise ExtractionImportError("document or revision metadata mismatch")
    try:
        validate_import_lineage(output, selection, selected, review)
    except ExtractionLineageError as error:
        raise ExtractionImportError(str(error)) from error
    reviewed = ProposedExtraction.model_validate(
        output.model_dump() | {"review_state": review.review_state}
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
        request_sha256=authoritative.request_sha256,
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
