"""Bounded document pipeline tests covering magic, encryption, corruption, limits, OCR."""

from hashlib import sha256
from pathlib import Path
from unittest.mock import patch

import pytest
from document_helpers import write_text_pdf

from backend.document_pipeline import (
    InvalidDocument,
    NeedsOcr,
    ParsedDocument,
    chunk_pages,
    run_document_pipeline,
)
from backend.documents import DocumentLimits


class FakeOcrSuccess:
    """Return one text page via isolated OCR."""

    def ocr(self, input_path: Path, output_path: Path) -> None:
        """Write a single recovered page without network."""
        from pypdf import PdfWriter
        from pypdf.generic import DictionaryObject, NameObject, StreamObject

        writer = PdfWriter()
        font = DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
            }
        )
        font_ref = writer._add_object(font)
        page = writer.add_blank_page(width=612, height=792)
        page[NameObject("/Resources")] = DictionaryObject(
            {NameObject("/Font"): DictionaryObject({NameObject("/F1"): font_ref})}
        )
        content = StreamObject()
        content.set_data(b"BT /F1 12 Tf 72 720 Td (ocr recovered text) Tj ET")
        page[NameObject("/Contents")] = writer._add_object(content)
        with output_path.open("wb") as out:
            writer.write(out)


class SlowOcr:
    """Sleep beyond the bounded timeout."""

    def ocr(self, input_path: Path, output_path: Path) -> None:
        """Exceed the time limit deliberately."""
        import time

        time.sleep(5)
        write_text_pdf(output_path, ["late"])


class OversizedOcr:
    """Produce too many pages to exceed page limit on re-parse."""

    def ocr(self, input_path: Path, output_path: Path) -> None:
        """Generate three pages regardless of input."""
        write_text_pdf(output_path, ["one", "two", "three"])


@pytest.mark.parametrize(
    ("kind", "code"),
    [
        ("wrong-magic", "WRONG_MAGIC"),
        ("encrypted", "ENCRYPTED_PDF"),
        ("corrupt", "CORRUPT_PDF"),
        ("oversize", "OVERSIZE"),
        ("over-pages", "TOO_MANY_PAGES"),
        ("page-text", "PAGE_TEXT_TOO_LARGE"),
    ],
)
def test_pipeline_rejects_invalid_boundaries(tmp_path: Path, kind: str, code: str) -> None:
    """Every invalid boundary returns a safe InvalidDocument code."""
    path = tmp_path / f"{kind}.pdf"
    limits = DocumentLimits(max_bytes=1_000_000, max_pages=2, max_page_chars=20)
    if kind == "wrong-magic":
        path.write_bytes(b"not a pdf")
    elif kind == "corrupt":
        path.write_bytes(b"%PDF-1.7\ninvalid")
    elif kind == "encrypted":
        write_text_pdf(path, ["secret"], encrypted=True)
    elif kind == "oversize":
        path.write_bytes(b"%PDF-" + b"x" * 1_000_000)
    elif kind == "over-pages":
        write_text_pdf(path, ["one", "two", "three"])
    else:
        write_text_pdf(path, ["x" * 21])
    result = run_document_pipeline(path, limits)
    assert isinstance(result, InvalidDocument)
    assert result.code == code


def test_pipeline_blank_scan_returns_needs_ocr(tmp_path: Path) -> None:
    """Blank scan without engine returns NeedsOcr marker."""
    path = write_text_pdf(tmp_path / "blank.pdf", [""])
    result = run_document_pipeline(path, DocumentLimits())
    assert isinstance(result, NeedsOcr)
    assert result.code == "NEEDS_OCR"
    assert result.byte_length == path.stat().st_size
    assert result.document_sha256 == sha256(path.read_bytes()).hexdigest()


def test_pipeline_ocr_success_returns_parsed(tmp_path: Path) -> None:
    """Blank scan with successful OCR returns parsed text through limits."""
    path = write_text_pdf(tmp_path / "scan.pdf", [""])
    result = run_document_pipeline(path, DocumentLimits(), ocr_engine=FakeOcrSuccess(), ocr_timeout=3.0)
    assert isinstance(result, ParsedDocument)
    assert any("ocr recovered" in p.text for p in result.pages)
    # Re-parse through same limits: chunking separates page text from excerpts
    chunks = chunk_pages(result)  # type: ignore[arg-type]
    assert len(chunks) == len(result.pages)


def test_pipeline_ocr_timeout_returns_invalid(tmp_path: Path) -> None:
    """OCR exceeding time limit returns safe OCR_TIMEOUT."""
    path = write_text_pdf(tmp_path / "slow.pdf", [""])
    result = run_document_pipeline(path, DocumentLimits(), ocr_engine=SlowOcr(), ocr_timeout=0.5)
    assert isinstance(result, InvalidDocument)
    assert result.code == "OCR_TIMEOUT"


def test_pipeline_ocr_reparse_enforces_page_limits(tmp_path: Path) -> None:
    """OCR output that violates page limit is rejected after re-parse."""
    path = write_text_pdf(tmp_path / "needs_ocr.pdf", [""])
    limits = DocumentLimits(max_pages=2)
    result = run_document_pipeline(path, limits, ocr_engine=OversizedOcr(), ocr_timeout=3.0)
    assert isinstance(result, InvalidDocument)
    assert result.code == "TOO_MANY_PAGES"


def test_pipeline_decompression_exhaustion(tmp_path: Path) -> None:
    """Decompression bomb maps to DECOMPRESSION_LIMIT without leaking bytes."""
    path = write_text_pdf(tmp_path / "ok.pdf", ["hello"])
    with patch("backend.documents.PdfReader", side_effect=MemoryError("decompression bomb")):
        result = run_document_pipeline(path, DocumentLimits())
        assert isinstance(result, InvalidDocument)
        assert result.code == "DECOMPRESSION_LIMIT"


def test_pipeline_emits_stages_in_order(tmp_path: Path) -> None:
    """Pipeline emits DOWNLOADING|VALIDATING|PARSING|CHUNKING|COMPLETE in order."""
    path = write_text_pdf(tmp_path / "valid.pdf", ["clause"])
    stages: list[str] = []
    result = run_document_pipeline(path, DocumentLimits(), on_stage=stages.append)
    assert isinstance(result, ParsedDocument)
    assert stages == ["DOWNLOADING", "VALIDATING", "PARSING", "CHUNKING", "COMPLETE"]


def test_pipeline_ocr_stages_include_ocr(tmp_path: Path) -> None:
    """Blank scan with OCR emits OCR between parsing and complete."""
    path = write_text_pdf(tmp_path / "scan2.pdf", [""])
    stages: list[str] = []
    result = run_document_pipeline(path, DocumentLimits(), ocr_engine=FakeOcrSuccess(), on_stage=stages.append, ocr_timeout=3.0)
    assert isinstance(result, ParsedDocument)
    assert "OCR" in stages
    assert stages.index("OCR") > stages.index("PARSING")
    assert stages[-1] == "COMPLETE"
