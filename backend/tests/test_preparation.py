"""Private selection validation and full-document request preparation tests."""

import json
from hashlib import sha256
from pathlib import Path

import pytest
from document_helpers import write_text_pdf

from backend.contracts.extraction import ExtractionRequestArtifact
from backend.preparation import PreparationError, prepare_extraction_requests
from backend.source_paths import SourceStorageRoots


def write_selection(tmp_path: Path, mutation: str | None = None) -> tuple[Path, Path]:
    """Write two private synthetic PDFs and a closed selection manifest."""
    private = tmp_path / "private"
    private.mkdir()
    base = write_text_pdf(private / "base.pdf", ["base one", "base two"])
    amendment = write_text_pdf(private / "amendment.pdf", ["amendment"])
    documents = [
        {
            "document_version_id": "base-v1",
            "role": "BASE_TENDER",
            "local_filename": "base.pdf",
            "source_url": "https://example.gov/base.pdf",
            "expected_sha256": sha256(base.read_bytes()).hexdigest(),
            "expected_page_count": 2,
            "expected_text_chars": len("base one") + len("base two"),
            "request_generated_at": "2026-08-20T12:00:00Z",
        },
        {
            "document_version_id": "amendment-v1",
            "role": "CORRIGENDUM",
            "local_filename": "amendment.pdf",
            "source_url": "https://example.gov/amendment.pdf",
            "expected_sha256": sha256(amendment.read_bytes()).hexdigest(),
            "expected_page_count": 1,
            "expected_text_chars": len("amendment"),
            "request_generated_at": "2026-08-20T12:00:00Z",
        },
    ]
    if mutation == "hash":
        documents[0]["expected_sha256"] = "0" * 64
    elif mutation == "pages":
        documents[0]["expected_page_count"] = 3
    elif mutation == "text":
        documents[0]["expected_text_chars"] = 1
    elif mutation == "path":
        documents[0]["local_filename"] = "../outside.pdf"
    elif mutation == "roles":
        documents[1]["role"] = "BASE_TENDER"
    manifest = {
        "selection_version": "1",
        "documents": documents,
        "change_review": {
            "reviewer": "Human Reviewer",
            "reviewed_at": "2026-08-20",
            "base_document_version_id": "base-v1",
            "base_physical_page_number": 1,
            "base_excerpt": "base one",
            "amendment_document_version_id": "amendment-v1",
            "amendment_physical_page_number": 1,
            "amendment_excerpt": "amendment",
            "effective_change_confirmed": True,
        },
    }
    if mutation == "swapped-review":
        review = manifest["change_review"]
        review.update(
            base_document_version_id="amendment-v1",
            base_excerpt="amendment",
            amendment_document_version_id="base-v1",
            amendment_excerpt="base one",
        )
    selection = private / "selection.json"
    selection.write_text(json.dumps(manifest))
    return selection, private


def test_prepare_requests_include_every_page_and_closed_tool_free_schema(
    tmp_path: Path,
) -> None:
    """Two valid selected documents produce complete ignored request artifacts."""
    selection, private = write_selection(tmp_path)
    output = tmp_path / "preparation"
    paths = prepare_extraction_requests(
        selection,
        output,
        private,
        SourceStorageRoots(preparation_root=output, demo_root=tmp_path / "demo"),
    )
    assert [path.name for path in paths] == ["base-v1.request.json", "amendment-v1.request.json"]
    requests = [ExtractionRequestArtifact.model_validate_json(path.read_bytes()) for path in paths]
    assert [[page.physical_page_number for page in item.request.pages] for item in requests] == [
        [1, 2],
        [1],
    ]
    assert all(item.request.tools == [] for item in requests)
    assert sum(len(page.text) for page in requests[0].request.pages) == len("base onebase two")


@pytest.mark.parametrize(
    "mutation", ["hash", "pages", "text", "path", "roles", "swapped-review"]
)
def test_prepare_rejects_selection_mutation_before_any_request_write(
    tmp_path: Path, mutation: str
) -> None:
    """Lineage, size, path, and role mismatches leave preparation output absent."""
    selection, private = write_selection(tmp_path, mutation)
    output = tmp_path / "preparation"
    with pytest.raises(PreparationError):
        prepare_extraction_requests(
            selection,
            output,
            private,
            SourceStorageRoots(preparation_root=output, demo_root=tmp_path / "demo"),
        )
    assert not output.exists()
