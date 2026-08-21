"""Local-only bounded parsing of digital-text PDF documents."""

import re
import unicodedata
from hashlib import sha256
from io import BytesIO
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field
from pypdf import PdfReader
from pypdf.errors import PdfReadError, PdfStreamError

from backend.contracts.source import Sha256


class DocumentError(ValueError):
    """Report a safe local document rejection reason."""

    def __init__(self, code: str) -> None:
        """Store only the stable non-sensitive rejection code."""
        super().__init__(code)
        self.code = code


class DocumentLimits(BaseModel):
    """Bound local PDF bytes, pages, and text passed to extraction."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    max_bytes: int = Field(default=25 * 1024 * 1024, ge=1)
    max_pages: int = Field(default=80, ge=1)
    max_page_chars: int = Field(default=8_000, ge=1)


class PageText(BaseModel):
    """Retain one physical page's exact extracted text and normalized hash."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    physical_page_number: int = Field(ge=1)
    text: str
    normalized_text_sha256: Sha256


class ParsedDocument(BaseModel):
    """Retain exact document identity and every text-bearing physical page."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    document_sha256: Sha256
    physical_page_count: int = Field(ge=1)
    byte_length: int = Field(ge=1)
    pages: list[PageText] = Field(min_length=1)


def _is_decompression_error(error: Exception) -> bool:
    """Detect decompression-bomb or resource-exhaustion signals safely."""
    if isinstance(error, (MemoryError, RecursionError)):
        return True
    msg = str(error).lower()
    return "decompression" in msg or "bomb" in msg or "exhaust" in msg


def parse_pdf(path: Path, limits: DocumentLimits) -> ParsedDocument:
    """Parse one bounded local digital-text PDF without network, OCR, or execution."""
    try:
        source_bytes = path.read_bytes()
    except OSError as error:
        raise DocumentError("MISSING_FILE") from error
    if len(source_bytes) > limits.max_bytes:
        raise DocumentError("OVERSIZE")
    if not source_bytes.startswith(b"%PDF-"):
        raise DocumentError("WRONG_MAGIC")
    try:
        reader = PdfReader(BytesIO(source_bytes), strict=True)
        if reader.is_encrypted:
            raise DocumentError("ENCRYPTED_PDF")
        page_count = len(reader.pages)
    except DocumentError:
        raise
    except (PdfReadError, PdfStreamError, ValueError, MemoryError, RecursionError) as error:
        if _is_decompression_error(error):
            raise DocumentError("DECOMPRESSION_LIMIT") from error
        raise DocumentError("CORRUPT_PDF") from error
    if page_count > limits.max_pages:
        raise DocumentError("TOO_MANY_PAGES")
    pages: list[PageText] = []
    try:
        for index, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            if len(text) > limits.max_page_chars:
                raise DocumentError("PAGE_TEXT_TOO_LARGE")
            normalized = normalize_text(text)
            if normalized:
                pages.append(
                    PageText(
                        physical_page_number=index,
                        text=text,
                        normalized_text_sha256=sha256(normalized.encode()).hexdigest(),
                    )
                )
    except DocumentError:
        raise
    except (PdfReadError, PdfStreamError, KeyError, ValueError, MemoryError, RecursionError) as error:
        if _is_decompression_error(error):
            raise DocumentError("DECOMPRESSION_LIMIT") from error
        raise DocumentError("CORRUPT_PDF") from error
    if not pages:
        raise DocumentError("NEEDS_OCR")
    return ParsedDocument(
        document_sha256=sha256(source_bytes).hexdigest(),
        physical_page_count=page_count,
        byte_length=len(source_bytes),
        pages=pages,
    )


def normalize_text(value: str) -> str:
    """Normalize Unicode and collapse whitespace for bounded evidence location."""
    normalized = unicodedata.normalize("NFKC", value)
    return re.sub(r"\s+", " ", normalized).strip()
