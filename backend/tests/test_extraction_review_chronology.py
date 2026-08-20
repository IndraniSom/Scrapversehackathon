"""Independent review chronology tests for Indian authority documents."""

from datetime import UTC, date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
from extraction_import_helpers import import_files

from backend import extraction_paths
from backend.extraction_import import ExtractionImportError
from backend.extraction_lineage import (
    ExtractionLineageError,
    validate_review_chronology,
)


@pytest.fixture(autouse=True)
def canonical_cache_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Redirect the module-derived canonical cache root for isolated imports."""
    monkeypatch.setattr(extraction_paths, "repository_extraction_root", lambda: tmp_path)


def test_import_rejects_response_after_review_local_date_without_write(
    tmp_path: Path,
) -> None:
    """A review dated before the response's India date cannot confirm that response."""
    response_at = datetime(2026, 8, 20, 18, 31, tzinfo=UTC)
    with pytest.raises(ExtractionImportError):
        import_files(tmp_path, response_at=response_at)
    assert not (tmp_path / "base.json").exists()


@pytest.mark.parametrize(
    "response_at",
    [
        datetime(2026, 8, 20, 18, 29, tzinfo=UTC),
        datetime(2026, 8, 20, 23, 59, tzinfo=ZoneInfo("Asia/Kolkata")),
    ],
)
def test_import_accepts_aware_response_on_review_local_date_boundary(
    tmp_path: Path, response_at: datetime
) -> None:
    """UTC and India-aware timestamps on the reviewed India date remain valid."""
    assert import_files(tmp_path, response_at=response_at).is_file()


def test_import_rejects_review_date_in_impossible_future_without_write(
    tmp_path: Path,
) -> None:
    """A future-dated human review cannot authorize an import today."""
    with pytest.raises(ExtractionImportError):
        import_files(tmp_path, reviewed_at=date(2099, 1, 1))
    assert not (tmp_path / "base.json").exists()


def test_review_chronology_rejects_naive_response_timestamp() -> None:
    """The chronology boundary cannot infer a timezone for a naive response."""
    with pytest.raises(ExtractionLineageError):
        naive_response = datetime(2026, 8, 20, 12)  # noqa: DTZ001 - rejection fixture
        validate_review_chronology(date(2026, 8, 20), naive_response)
