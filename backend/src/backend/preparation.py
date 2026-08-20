"""Private selection validation and complete ignored request preparation."""

import json
from pathlib import Path

from pydantic import ValidationError

from backend.contracts.extraction import ExtractionRequestArtifact
from backend.contracts.selection import PrivateSelection, SelectedDocument
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


PreparedDocument = tuple[SelectedDocument, ParsedDocument, ExtractionRequestArtifact]


def prepare_extraction_requests(
    selection_path: Path,
    output_directory: Path,
    private_root: Path,
    storage_roots: SourceStorageRoots,
) -> list[Path]:
    """Validate both selected PDFs before atomically writing complete request files."""
    selection, prepared = load_prepared_selection(selection_path, private_root)
    try:
        validate_staging_directory(output_directory, storage_roots)
    except StorageBoundaryError as error:
        raise PreparationError("request output is outside preparation storage") from error
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
    assert selection.selection_version == "1"
    return paths


def load_prepared_selection(
    selection_path: Path, private_root: Path
) -> tuple[PrivateSelection, list[PreparedDocument]]:
    """Validate selection roles, both PDFs, and reviewed change excerpts without writes."""
    try:
        selection = PrivateSelection.model_validate_json(selection_path.read_bytes())
        if {item.role for item in selection.documents} != {"BASE_TENDER", "CORRIGENDUM"}:
            raise PreparationError("selection must contain base and corrigendum")
        prepared = [_prepare_document(item, private_root) for item in selection.documents]
        _validate_change_review(selection, prepared)
        return selection, prepared
    except PreparationError:
        raise
    except (DocumentError, OSError, ValidationError) as error:
        raise PreparationError("selection or private document is invalid") from error


def rebuild_request_from_selection(
    selection_path: Path, pdf_path: Path
) -> tuple[PrivateSelection, SelectedDocument, ParsedDocument, ExtractionRequestArtifact]:
    """Rebuild the authoritative request for one selected PDF using its fixed timestamp."""
    selection, prepared = load_prepared_selection(selection_path, selection_path.parent)
    resolved = pdf_path.resolve()
    for selected, document, artifact in prepared:
        if (selection_path.parent / selected.local_filename).resolve() == resolved:
            return selection, selected, document, artifact
    raise PreparationError("PDF is not one of the selected private documents")


def _prepare_document(selected: SelectedDocument, private_root: Path) -> PreparedDocument:
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
        document, lineage, ExtractionRequestConfig(), selected.request_generated_at
    )
    return selected, document, artifact


def _validate_change_review(
    selection: PrivateSelection, prepared: list[PreparedDocument]
) -> None:
    """Bind reviewed IDs to roles and locate both confirmed excerpts."""
    selected_by_id = {item.document_version_id: item for item, _, _ in prepared}
    documents = {item.document_version_id: document for item, document, _ in prepared}
    review = selection.change_review
    base = selected_by_id.get(review.base_document_version_id)
    amendment = selected_by_id.get(review.amendment_document_version_id)
    if base is None or base.role != "BASE_TENDER" or amendment is None or amendment.role != "CORRIGENDUM":
        raise PreparationError("change review IDs do not match selected document roles")
    pairs = (
        (base.document_version_id, review.base_physical_page_number, review.base_excerpt),
        (
            amendment.document_version_id,
            review.amendment_physical_page_number,
            review.amendment_excerpt,
        ),
    )
    for document_id, page_number, excerpt in pairs:
        page = next(
            (
                item
                for item in documents[document_id].pages
                if item.physical_page_number == page_number
            ),
            None,
        )
        if page is None or normalize_text(excerpt) not in normalize_text(page.text):
            raise PreparationError("human-reviewed change excerpt is not locatable")
