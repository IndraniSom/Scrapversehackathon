"""Private selection validation and complete ignored request preparation."""

import json
from datetime import date, datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from backend.contracts.extraction import ExtractionRequestArtifact
from backend.contracts.source import HttpsUrl, MetadataText, Sha256
from backend.documents import (
    DocumentError,
    DocumentLimits,
    ParsedDocument,
    normalize_text,
    parse_pdf,
)
from backend.extraction import ExtractionRequestConfig, ExtractionSelection
from backend.extraction_requests import build_extraction_request
from backend.source_paths import (
    SourceStorageRoots,
    StorageBoundaryError,
    validate_staging_directory,
)
from backend.source_storage import StorageError, atomic_install


class PreparationError(ValueError):
    """Report safe private selection or request preparation failure."""


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


def prepare_extraction_requests(
    selection_path: Path,
    output_directory: Path,
    private_root: Path,
    storage_roots: SourceStorageRoots,
    generated_at: datetime,
) -> list[Path]:
    """Validate both selected PDFs before atomically writing complete request files."""
    try:
        validate_staging_directory(output_directory, storage_roots)
        selection = PrivateSelection.model_validate_json(selection_path.read_bytes())
        if {item.role for item in selection.documents} != {"BASE_TENDER", "CORRIGENDUM"}:
            raise PreparationError("selection must contain base and corrigendum")
        prepared = [
            _prepare_document(item, private_root, generated_at)
            for item in selection.documents
        ]
        _validate_change_review(selection, prepared)
    except PreparationError:
        raise
    except (
        DocumentError,
        OSError,
        StorageBoundaryError,
        ValidationError,
    ) as error:
        raise PreparationError("selection or private document is invalid") from error
    paths: list[Path] = []
    try:
        for selected, _, artifact in prepared:
            content = (
                json.dumps(
                    artifact.model_dump(mode="json"),
                    sort_keys=True,
                    separators=(",", ":"),
                )
                + "\n"
            ).encode()
            paths.append(
                atomic_install(
                    output_directory,
                    f"{selected.document_version_id}.request.json",
                    content,
                )
            )
    except StorageError as error:
        raise PreparationError("request artifact write failed") from error
    return paths


def _prepare_document(
    selected: SelectedDocument,
    private_root: Path,
    generated_at: datetime,
) -> tuple[SelectedDocument, ParsedDocument, ExtractionRequestArtifact]:
    """Validate one selected private PDF and build its complete request in memory."""
    if Path(selected.local_filename).name != selected.local_filename:
        raise PreparationError("private filename must be a basename")
    path = (private_root / selected.local_filename).resolve()
    if not path.is_relative_to(private_root.resolve()):
        raise PreparationError("private document escapes selected root")
    document = parse_pdf(path, DocumentLimits())
    if (
        document.document_sha256 != selected.expected_sha256
        or document.physical_page_count != selected.expected_page_count
        or sum(len(page.text) for page in document.pages) != selected.expected_text_chars
    ):
        raise PreparationError("private document facts do not match selection")
    lineage = ExtractionSelection(
        document_version_id=selected.document_version_id,
        role=selected.role,
        source_url=selected.source_url,
    )
    artifact = build_extraction_request(
        document, lineage, ExtractionRequestConfig(), generated_at
    )
    return selected, document, artifact


def _validate_change_review(
    selection: PrivateSelection,
    prepared: list[tuple[SelectedDocument, ParsedDocument, ExtractionRequestArtifact]],
) -> None:
    """Locate both human-confirmed change excerpts in their selected document pages."""
    documents = {item.document_version_id: document for item, document, _ in prepared}
    review = selection.change_review
    pairs = (
        (
            review.base_document_version_id,
            review.base_physical_page_number,
            review.base_excerpt,
        ),
        (
            review.amendment_document_version_id,
            review.amendment_physical_page_number,
            review.amendment_excerpt,
        ),
    )
    for document_id, page_number, excerpt in pairs:
        document = documents.get(document_id)
        page = next(
            (
                item
                for item in document.pages
                if item.physical_page_number == page_number
            ),
            None,
        ) if document is not None else None
        if page is None or normalize_text(excerpt) not in normalize_text(page.text):
            raise PreparationError("human-reviewed change excerpt is not locatable")
