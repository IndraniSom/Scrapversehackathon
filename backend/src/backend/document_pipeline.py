"""Bounded document pipeline with staged progress and OCR handoff."""

from __future__ import annotations

from collections.abc import Callable
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict
from pypdf import PdfReader

from backend.contracts.source import Sha256
from backend.documents import DocumentError, DocumentLimits, ParsedDocument, parse_pdf

PipelineStage = Literal[
    "DOWNLOADING", "VALIDATING", "OCR", "PARSING", "CHUNKING", "COMPLETE"
]
PIPELINE_STAGES: tuple[PipelineStage, ...] = (
    "DOWNLOADING",
    "VALIDATING",
    "OCR",
    "PARSING",
    "CHUNKING",
    "COMPLETE",
)


class InvalidDocument(BaseModel):
    """Report a bounded rejection without leaking source bytes."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    code: str
    byte_length: int | None = None


class NeedsOcr(BaseModel):
    """Signal a blank scan that requires OCR before extraction."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    document_sha256: Sha256
    byte_length: int
    physical_page_count: int
    code: str = "NEEDS_OCR"


PipelineResult = ParsedDocument | NeedsOcr | InvalidDocument


def _emit(stage: PipelineStage, handler: Callable[[PipelineStage], None] | None) -> None:
    """Invoke the progress handler with one bounded stage name.

    Args:
        stage: Bounded stage literal to report.
        handler: Optional callback receiving the stage.
    """
    if handler is not None:
        handler(stage)


def _build_needs_ocr(path: Path) -> NeedsOcr:
    """Derive OCR marker from local bytes and page count safely.

    Args:
        path: Local file path that required OCR.

    Returns:
        Marker with document SHA-256, byte length, and page count.
    """
    try:
        raw = path.read_bytes()
    except OSError:
        raw = b""
    sha = sha256(raw).hexdigest() if raw else "0" * 64
    count = 1
    try:
        if raw.startswith(b"%PDF-"):
            reader = PdfReader(BytesIO(raw), strict=False)
            count = len(reader.pages) or 1
    except Exception:
        count = 1
    return NeedsOcr(document_sha256=sha, byte_length=len(raw), physical_page_count=count)


def run_document_pipeline(
    path: Path,
    limits: DocumentLimits,
    ocr_engine: object | None = None,
    on_stage: Callable[[PipelineStage], None] | None = None,
    ocr_timeout: float = 8.0,
) -> PipelineResult:
    """Run bounded DOWNLOADING→VALIDATING→PARSING→[OCR]→CHUNKING→COMPLETE pipeline.

    Args:
        path: Local PDF path to validate and parse.
        limits: Bounded bytes, page count, and per-page char limits.
        ocr_engine: Optional OCR adapter for blank scans.
        on_stage: Optional progress callback receiving stage literals.
        ocr_timeout: Bounded time for isolated OCR in seconds.

    Returns:
        ParsedDocument on success, NeedsOcr for blank scan, or InvalidDocument.
    """
    _emit("DOWNLOADING", on_stage)
    _emit("VALIDATING", on_stage)
    _emit("PARSING", on_stage)
    try:
        parsed = parse_pdf(path, limits)
        _emit("CHUNKING", on_stage)
        _emit("COMPLETE", on_stage)
        return parsed
    except DocumentError as error:
        if error.code == "NEEDS_OCR":
            if ocr_engine is None:
                _emit("COMPLETE", on_stage)
                return _build_needs_ocr(path)
            _emit("OCR", on_stage)
            try:
                from backend.ocr import OcrTimeoutError, run_ocr_and_parse

                parsed_ocr = run_ocr_and_parse(
                    path, limits, ocr_engine, timeout=ocr_timeout  # type: ignore[arg-type]
                )
                _emit("PARSING", on_stage)
                _emit("CHUNKING", on_stage)
                _emit("COMPLETE", on_stage)
                return parsed_ocr
            except OcrTimeoutError:
                _emit("COMPLETE", on_stage)
                return InvalidDocument(code="OCR_TIMEOUT", byte_length=None)
            except DocumentError as exc2:
                _emit("COMPLETE", on_stage)
                if exc2.code == "NEEDS_OCR":
                    return _build_needs_ocr(path)
                return InvalidDocument(code=exc2.code)
            except Exception:
                _emit("COMPLETE", on_stage)
                return InvalidDocument(code="OCR_FAILED")
        _emit("COMPLETE", on_stage)
        return InvalidDocument(code=error.code)
    except (MemoryError, RecursionError):
        _emit("COMPLETE", on_stage)
        return InvalidDocument(code="DECOMPRESSION_LIMIT")
    except Exception:
        _emit("COMPLETE", on_stage)
        return InvalidDocument(code="CORRUPT_PDF")


# Backward-compatible alias for callers expecting `process_document`.
process_document = run_document_pipeline


def chunk_pages(parsed: ParsedDocument) -> list[list[str]]:
    """Split parsed pages into bounded chunks separately from public excerpts.

    Args:
        parsed: Valid parsed document with page texts.

    Returns:
        List of per-page chunks, each as a single-element list.
    """
    chunks: list[list[str]] = []
    for page in parsed.pages:
        chunks.append([page.text])
    return chunks
