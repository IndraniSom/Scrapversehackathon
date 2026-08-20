"""Network-free response import, human review, and cached artifact tests."""

import json
from pathlib import Path

import pytest
from extraction_import_helpers import import_files

from backend import extraction_paths
from backend.extraction_import import (
    ExtractionImportError,
    verify_cached_extraction,
    verify_extraction_directory,
)


@pytest.fixture(autouse=True)
def canonical_cache_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Redirect the module-derived canonical cache root for isolated imports."""
    monkeypatch.setattr(extraction_paths, "repository_extraction_root", lambda: tmp_path)


def test_import_writes_bounded_cache_only_after_evidence_and_human_review(
    tmp_path: Path,
) -> None:
    """A matching response and confirmed review produce one offline-valid cache."""
    output = import_files(tmp_path)
    cached = verify_cached_extraction(output)
    assert output.name == "base.json"
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
    assert not (tmp_path / "base.json").exists()


def test_verify_directory_requires_base_and_corrigendum_caches(tmp_path: Path) -> None:
    """Offline verification rejects absent or incomplete extraction directories."""
    with pytest.raises(ExtractionImportError):
        verify_extraction_directory(tmp_path / "missing")
    import_files(tmp_path)
    with pytest.raises(ExtractionImportError):
        verify_extraction_directory(tmp_path)
