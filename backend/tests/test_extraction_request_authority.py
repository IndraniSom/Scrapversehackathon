"""Authoritative request reconstruction and response chronology tests."""

from pathlib import Path

import pytest
from extraction_import_helpers import import_files

from backend import extraction_paths
from backend.extraction_import import ExtractionImportError


@pytest.fixture(autouse=True)
def canonical_cache_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Redirect the module-derived canonical cache root for isolated imports."""
    monkeypatch.setattr(extraction_paths, "repository_extraction_root", lambda: tmp_path)


@pytest.mark.parametrize(
    "mutation",
    [
        "request-pages",
        "request-instructions",
        "request-schema",
        "request-selection",
        "request-prompt",
        "request-timestamp",
        "response-before-request",
    ],
)
def test_import_rejects_self_rehashed_request_or_predating_response(
    tmp_path: Path, mutation: str
) -> None:
    """Local selection/PDF authority defeats self-consistent request tampering."""
    with pytest.raises(ExtractionImportError):
        import_files(tmp_path, mutation=mutation)
    assert not (tmp_path / "base.json").exists()
