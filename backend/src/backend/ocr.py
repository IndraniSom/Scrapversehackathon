"""OCR adapter with isolated process, resource limits, and bounded re-parse."""

from __future__ import annotations

import multiprocessing
import tempfile
from pathlib import Path
from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field

from backend.documents import DocumentLimits, ParsedDocument, parse_pdf


class OcrLimits(BaseModel):
    """Bound OCR CPU, memory, time, and page usage."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    max_cpu_seconds: int = Field(default=10, ge=1)
    max_memory_bytes: int = Field(default=512 * 1024 * 1024, ge=1)
    timeout_seconds: float = Field(default=8.0, ge=0.1)
    max_pages: int = Field(default=80, ge=1)


class OcrError(ValueError):
    """Report a safe OCR failure code."""

    def __init__(self, code: str) -> None:
        """Store stable non-sensitive OCR code."""
        super().__init__(code)
        self.code = code


class OcrTimeoutError(OcrError):
    """Signal OCR exceeded bounded time."""

    def __init__(self) -> None:
        """Store timeout code."""
        super().__init__("OCR_TIMEOUT")


class OcrEngine(Protocol):
    """Adapter for pluggable OCR backends."""

    def ocr(self, input_path: Path, output_path: Path) -> None:
        """Render OCR output PDF to output_path without network."""
        ...


def _apply_limits(cpu_seconds: int, memory_bytes: int) -> None:
    """Apply CPU and memory limits inside the isolated OCR process."""
    try:
        import resource

        resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
        resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))
    except Exception:
        return


def _ocr_worker(
    input_str: str, output_str: str, engine: OcrEngine, cpu: int, mem: int
) -> None:
    """Run OCR in the child process with resource limits applied."""
    _apply_limits(cpu, mem)
    engine.ocr(Path(input_str), Path(output_str))


def run_ocr_and_parse(
    input_path: Path,
    limits: DocumentLimits,
    engine: OcrEngine,
    timeout: float = 8.0,
    ocr_limits: OcrLimits | None = None,
) -> ParsedDocument:
    """Run OCR in isolation with CPU/memory/time/page limits, re-parse, and cleanup."""
    eff = ocr_limits or OcrLimits(timeout_seconds=timeout)
    # Isolated process with bounded resources
    tmp_path: Path | None = None
    output_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            output_path = Path(tmp.name)
        tmp_path = output_path
        ctx = multiprocessing.get_context("spawn")
        proc = ctx.Process(
            target=_ocr_worker,
            args=(str(input_path), str(output_path), engine, eff.max_cpu_seconds, eff.max_memory_bytes),
        )
        proc.start()
        # Enforce time limit
        proc.join(timeout=eff.timeout_seconds)
        if proc.is_alive():
            proc.terminate()
            proc.join(1.0)
            try:
                if proc.is_alive():
                    proc.kill()
            except Exception:
                pass
            raise OcrTimeoutError
        if proc.exitcode != 0:
            raise OcrError("OCR_FAILED")
        if eff.max_pages and limits.max_pages and eff.max_pages < limits.max_pages:
            limits = DocumentLimits(
                max_bytes=limits.max_bytes,
                max_pages=eff.max_pages,
                max_page_chars=limits.max_page_chars,
            )
        # Re-parse through same PDF and text limits; never trust OCR bytes
        parsed = parse_pdf(output_path, limits)
        # Page limit already enforced by parse_pdf
        return parsed
    finally:
        # Delete temporary files in finally blocks
        if output_path is not None:
            try:
                output_path.unlink(missing_ok=True)
            except Exception:
                pass


def isolated_ocr(
    input_path: Path, output_path: Path, engine: OcrEngine, limits: OcrLimits | None = None
) -> Path:
    """Run OCR to output_path with time and resource limits and ensure cleanup on failure."""
    lim = limits or OcrLimits()
    proc = multiprocessing.get_context("spawn").Process(
        target=_ocr_worker,
        args=(str(input_path), str(output_path), engine, lim.max_cpu_seconds, lim.max_memory_bytes),
    )
    try:
        proc.start()
        proc.join(timeout=lim.timeout_seconds)
        if proc.is_alive():
            proc.terminate()
            proc.join(1.0)
            raise OcrTimeoutError
        if proc.exitcode != 0:
            raise OcrError("OCR_FAILED")
        return output_path
    except Exception:
        try:
            output_path.unlink(missing_ok=True)
        except Exception:
            pass
        raise
    finally:
        # Ensure child is reaped; temp cleanup handled by caller
        if proc.is_alive():
            try:
                proc.terminate()
            except Exception:
                pass
