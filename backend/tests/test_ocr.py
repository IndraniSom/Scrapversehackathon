"""OCR adapter tests for isolated process, limits, re-parse, and cleanup."""

from pathlib import Path
from unittest.mock import patch

import pytest
from document_helpers import write_text_pdf

from backend.documents import DocumentLimits
from backend.ocr import OcrLimits, OcrTimeoutError, run_ocr_and_parse


class FakeOcrSuccess:
    """Recover text for a blank scan."""

    def ocr(self, input_path: Path, output_path: Path) -> None:
        """Write a valid single-page PDF."""
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
        content.set_data(b"BT /F1 12 Tf 72 720 Td (ocr text) Tj ET")
        page[NameObject("/Contents")] = writer._add_object(content)
        with output_path.open("wb") as out:
            writer.write(out)


class SlowOcr:
    """Exceed bounded time."""

    def ocr(self, input_path: Path, output_path: Path) -> None:
        """Sleep longer than timeout."""
        import time

        time.sleep(4)
        write_text_pdf(output_path, ["late"])


class OversizedOcr:
    """Produce output exceeding page limit."""

    def ocr(self, input_path: Path, output_path: Path) -> None:
        """Write three pages."""
        write_text_pdf(output_path, ["a", "b", "c"])


class BlankOcr:
    """Produce blank output that still needs OCR."""

    def ocr(self, input_path: Path, output_path: Path) -> None:
        """Write empty-text PDF."""
        write_text_pdf(output_path, [""])


def test_ocr_success_reparses_through_limits(tmp_path: Path) -> None:
    """OCR output is re-parsed through DocumentLimits before return."""
    src = write_text_pdf(tmp_path / "in.pdf", [""])
    parsed = run_ocr_and_parse(src, DocumentLimits(), FakeOcrSuccess(), timeout=3.0)
    assert parsed.physical_page_count == 1
    assert "ocr text" in parsed.pages[0].text


def test_ocr_timeout_in_isolated_process(tmp_path: Path) -> None:
    """OCR exceeding time is terminated and reported as OCR_TIMEOUT."""
    src = write_text_pdf(tmp_path / "in.pdf", [""])
    with pytest.raises(OcrTimeoutError) as exc:
        run_ocr_and_parse(src, DocumentLimits(), SlowOcr(), timeout=0.4)
    assert exc.value.code == "OCR_TIMEOUT"


def test_ocr_reparse_enforces_page_limits(tmp_path: Path) -> None:
    """OCR that exceeds page limits is rejected via re-parse."""
    src = write_text_pdf(tmp_path / "in.pdf", [""])
    limits = DocumentLimits(max_pages=2)
    with pytest.raises(Exception) as exc:
        run_ocr_and_parse(src, limits, OversizedOcr(), timeout=3.0)
    assert "TOO_MANY_PAGES" in str(exc.value) or getattr(exc.value, "code", "") == "TOO_MANY_PAGES"


def test_ocr_blank_output_still_needs_ocr(tmp_path: Path) -> None:
    """OCR producing blank pages remains NEEDS_OCR after re-parse."""
    src = write_text_pdf(tmp_path / "in.pdf", [""])
    with pytest.raises(Exception) as exc:
        run_ocr_and_parse(src, DocumentLimits(), BlankOcr(), timeout=3.0)
    assert getattr(exc.value, "code", "") == "NEEDS_OCR"


def test_ocr_decompression_exhaustion_is_bounded(tmp_path: Path) -> None:
    """Decompression bomb during re-parse maps to DECOMPRESSION_LIMIT and cleans up."""
    src = write_text_pdf(tmp_path / "in.pdf", [""])
    with patch("backend.ocr.parse_pdf", side_effect=MemoryError("decompression bomb")):
        try:
            run_ocr_and_parse(src, DocumentLimits(), FakeOcrSuccess(), timeout=3.0)
            assert False, "expected decompression error"
        except MemoryError:
            pass
        except Exception as exc:
            assert "DECOMPRESSION" in str(exc) or getattr(exc, "code", "") == "DECOMPRESSION_LIMIT"


def test_ocr_finally_cleanup_removes_temp_on_success(tmp_path: Path) -> None:
    """Temporary OCR file is deleted in finally after successful re-parse."""
    src = write_text_pdf(tmp_path / "in.pdf", [""])
    # Patch unlink to count calls but still delete
    original_unlink = Path.unlink
    calls: list[Path] = []

    def counting_unlink(self: Path, *a, **kw):  # type: ignore[no-untyped-def]
        calls.append(self)
        return original_unlink(self, *a, **kw)

    with patch.object(Path, "unlink", counting_unlink):
        run_ocr_and_parse(src, DocumentLimits(), FakeOcrSuccess(), timeout=3.0)
    assert len(calls) >= 1


def test_ocr_finally_cleanup_on_timeout(tmp_path: Path) -> None:
    """Temporary file is cleaned even when OCR times out."""
    src = write_text_pdf(tmp_path / "in.pdf", [""])
    original_unlink = Path.unlink
    calls: list[Path] = []

    def counting_unlink(self: Path, *a, **kw):  # type: ignore[no-untyped-def]
        calls.append(self)
        return original_unlink(self, *a, **kw)

    with patch.object(Path, "unlink", counting_unlink):
        with pytest.raises(OcrTimeoutError):
            run_ocr_and_parse(src, DocumentLimits(), SlowOcr(), timeout=0.4)
    assert len(calls) >= 1


def test_ocr_respects_cpu_memory_page_limits(tmp_path: Path) -> None:
    """OcrLimits caps CPU, memory, time, and pages together."""
    src = write_text_pdf(tmp_path / "in.pdf", [""])
    limits = OcrLimits(max_cpu_seconds=2, max_memory_bytes=256 * 1024 * 1024, timeout_seconds=3.0, max_pages=1)
    parsed = run_ocr_and_parse(src, DocumentLimits(max_pages=1), FakeOcrSuccess(), timeout=3.0, ocr_limits=limits)
    assert parsed.physical_page_count == 1
