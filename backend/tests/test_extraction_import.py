"""Network-free response import, human review, and cached artifact tests."""

import json
from datetime import UTC, date, datetime
from pathlib import Path

import pytest
from document_helpers import write_text_pdf
from extraction_helpers import evidence, proposed

from backend.contracts.extraction import ExtractionEnvelope
from backend.documents import DocumentLimits, parse_pdf
from backend.extraction import ExtractionRequestConfig, ExtractionSelection
from backend.extraction_import import (
    ExtractionImportError,
    HumanExtractionReview,
    import_response_files,
    verify_cached_extraction,
    verify_extraction_directory,
)
from backend.extraction_requests import build_extraction_request


def import_files(tmp_path: Path, *, mutation: str | None = None) -> Path:
    """Build one complete synthetic request/response/review import file set."""
    pdf = write_text_pdf(
        tmp_path / "document.pdf",
        ["Average sales turnover must be Rs. 12 Crores."],
    )
    document = parse_pdf(pdf, DocumentLimits())
    selection = ExtractionSelection(
        document_version_id="base-v1",
        role="BASE_TENDER",
        source_url="https://example.gov/base.pdf",
    )
    request = build_extraction_request(
        document,
        selection,
        ExtractionRequestConfig(),
        datetime(2026, 8, 20, 12, tzinfo=UTC),
    )
    proposal = proposed().model_copy(
        update={
            "document_sha256": document.document_sha256,
            "processed_page_numbers": [1],
            "requirements": proposed().requirements.model_copy(
                update={
                    "children": [
                        proposed().requirements.children[0].model_copy(
                            update={"evidence": [evidence()]}
                        )
                    ]
                }
            ),
        }
    )
    envelope = ExtractionEnvelope(
        request_sha256=request.request_sha256,
        provider="DEEPSEEK",
        model="deepseek-chat",
        prompt_version="ocac-v1",
        prompt_sha256=request.request.prompt_sha256,
        schema_version="rules-v1",
        generated_at=datetime(2026, 8, 20, 12, 1, tzinfo=UTC),
        output=proposal,
        refusal=None,
        failure_code=None,
    )
    review = HumanExtractionReview(
        reviewer="Human Reviewer",
        reviewed_at=date(2026, 8, 20),
        document_sha256=document.document_sha256,
        revision=1,
        review_state="HUMAN_CONFIRMED",
        evidence_confirmed=True,
        authority_confirmed=True,
    )
    if mutation == "request-hash":
        envelope = envelope.model_copy(update={"request_sha256": "f" * 64})
    elif mutation == "model":
        envelope = envelope.model_copy(update={"model": "different-model"})
    elif mutation == "rejected-review":
        review = review.model_copy(update={"review_state": "HUMAN_REJECTED"})
    elif mutation == "unconfirmed-evidence":
        review = review.model_copy(update={"evidence_confirmed": False})
    elif mutation == "missing-excerpt":
        output = envelope.output
        assert output is not None
        bad = output.model_copy(
            update={
                "requirements": output.requirements.model_copy(
                    update={
                        "children": [
                            output.requirements.children[0].model_copy(
                                update={"evidence": [evidence(excerpt="missing")]}
                            )
                        ]
                    }
                )
            }
        )
        envelope = envelope.model_copy(update={"output": bad})
    request_path = tmp_path / "request.json"
    response_path = tmp_path / "response.json"
    review_path = tmp_path / "review.json"
    request_path.write_text(request.model_dump_json())
    response_path.write_text(envelope.model_dump_json())
    review_path.write_text(review.model_dump_json())
    output_path = tmp_path / "cached.json"
    import_response_files(
        request_path, response_path, review_path, pdf, output_path
    )
    return output_path


def test_import_writes_bounded_cache_only_after_evidence_and_human_review(
    tmp_path: Path,
) -> None:
    """A matching response and confirmed review produce one offline-valid cache."""
    output = import_files(tmp_path)
    cached = verify_cached_extraction(output)
    assert cached.review_state == "HUMAN_CONFIRMED"
    assert cached.verified.extraction_state == "EVIDENCE_VERIFIED"
    assert "pages" not in json.loads(output.read_text())


@pytest.mark.parametrize(
    "mutation",
    ["request-hash", "model", "rejected-review", "unconfirmed-evidence", "missing-excerpt"],
)
def test_import_rejects_mismatch_before_cached_write(
    tmp_path: Path, mutation: str
) -> None:
    """Metadata, review, and evidence failures leave no cached extraction."""
    with pytest.raises(ExtractionImportError):
        import_files(tmp_path, mutation=mutation)
    assert not (tmp_path / "cached.json").exists()


def test_verify_directory_requires_base_and_corrigendum_caches(tmp_path: Path) -> None:
    """Offline verification rejects absent or incomplete extraction directories."""
    with pytest.raises(ExtractionImportError):
        verify_extraction_directory(tmp_path / "missing")
    one = import_files(tmp_path)
    one.rename(tmp_path / "base.json")
    with pytest.raises(ExtractionImportError):
        verify_extraction_directory(tmp_path)
