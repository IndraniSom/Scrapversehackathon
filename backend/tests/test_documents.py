"""Local-only PDF parsing and document-limit tests."""

from hashlib import sha256
from pathlib import Path

import pytest
from document_helpers import write_text_pdf

from backend.documents import DocumentError, DocumentLimits, parse_pdf


def test_parse_pdf_uses_one_based_complete_text_page_inventory(tmp_path: Path) -> None:
    """Every digital-text page is retained one-based with exact document/page hashes."""
    path = write_text_pdf(tmp_path / "valid.pdf", ["First clause", "Second clause"])
    parsed = parse_pdf(path, DocumentLimits())
    assert parsed.document_sha256 == sha256(path.read_bytes()).hexdigest()
    assert parsed.physical_page_count == 2
    assert [page.physical_page_number for page in parsed.pages] == [1, 2]
    assert [page.text.strip() for page in parsed.pages] == ["First clause", "Second clause"]
    assert all(len(page.normalized_text_sha256) == 64 for page in parsed.pages)


def test_identical_pdf_bytes_produce_identical_parsed_hash(tmp_path: Path) -> None:
    """Byte-identical local documents always retain the same source hash."""
    first = write_text_pdf(tmp_path / "first.pdf", ["same"])
    second = tmp_path / "second.pdf"
    second.write_bytes(first.read_bytes())
    assert parse_pdf(first, DocumentLimits()).document_sha256 == parse_pdf(
        second, DocumentLimits()
    ).document_sha256


@pytest.mark.parametrize(
    ("kind", "expected"),
    [
        ("wrong-magic", "WRONG_MAGIC"),
        ("corrupt", "CORRUPT_PDF"),
        ("encrypted", "ENCRYPTED_PDF"),
        ("empty-text", "NEEDS_OCR"),
        ("oversize", "OVERSIZE"),
        ("over-pages", "TOO_MANY_PAGES"),
        ("page-text", "PAGE_TEXT_TOO_LARGE"),
    ],
)
def test_parse_pdf_rejects_invalid_or_unsupported_input(
    tmp_path: Path, kind: str, expected: str
) -> None:
    """Every local PDF invalid/unsupported boundary returns one safe reason code."""
    path = tmp_path / f"{kind}.pdf"
    limits = DocumentLimits(max_bytes=1_000_000, max_pages=2, max_page_chars=20)
    if kind == "wrong-magic":
        path.write_bytes(b"not a pdf")
    elif kind == "corrupt":
        path.write_bytes(b"%PDF-1.7\ninvalid")
    elif kind == "encrypted":
        write_text_pdf(path, ["secret"], encrypted=True)
    elif kind == "empty-text":
        write_text_pdf(path, [""])
    elif kind == "oversize":
        path.write_bytes(b"%PDF-" + b"x" * 1_000_000)
    elif kind == "over-pages":
        write_text_pdf(path, ["one", "two", "three"])
    else:
        write_text_pdf(path, ["x" * 21])
    with pytest.raises(DocumentError) as captured:
        parse_pdf(path, limits)
    assert captured.value.code == expected
