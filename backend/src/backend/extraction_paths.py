"""Canonical committed extraction-cache destination policy."""

from pathlib import Path
from typing import Literal


class ExtractionCachePathError(ValueError):
    """Report an output outside the canonical role-derived cache path."""


def repository_extraction_root() -> Path:
    """Return the non-overridable backend demo extraction cache root."""
    return Path(__file__).resolve().parents[2] / "data" / "demo" / "extractions"


def validate_extraction_output(
    output_path: Path, role: Literal["BASE_TENDER", "CORRIGENDUM"]
) -> Path:
    """Require the exact canonical base.json or amendment.json path for its role."""
    filename = "base.json" if role == "BASE_TENDER" else "amendment.json"
    expected = (repository_extraction_root() / filename).resolve()
    if output_path.resolve() != expected:
        raise ExtractionCachePathError("extraction output path does not match role")
    return expected


def extraction_output_for_role(
    role: Literal["BASE_TENDER", "CORRIGENDUM"],
) -> Path:
    """Derive the only committed cache path permitted for a verified document role."""
    filename = "base.json" if role == "BASE_TENDER" else "amendment.json"
    return repository_extraction_root() / filename
