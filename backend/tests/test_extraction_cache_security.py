"""Canonical cache path, cross-document lineage, and inventory mutation tests."""

import json
from copy import deepcopy
from pathlib import Path

import pytest
from extraction_import_helpers import import_files

from backend import extraction_paths
from backend.extraction_import import (
    ExtractionImportError,
    verify_cached_extraction,
    verify_extraction_directory,
)
from backend.extraction_paths import (
    ExtractionCachePathError,
    validate_extraction_output,
)


@pytest.fixture(autouse=True)
def canonical_cache_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Redirect the non-overridable module-derived cache root for isolated tests."""
    monkeypatch.setattr(extraction_paths, "repository_extraction_root", lambda: tmp_path)


@pytest.mark.parametrize(
    "mutation", ["truncate", "duplicate", "gap", "out-of-range", "missing-evidence"]
)
def test_cached_inventory_rejects_each_page_mutation(
    tmp_path: Path, mutation: str
) -> None:
    """Offline inventory must remain ordered, unique, complete, and evidence-covering."""
    output = import_files(tmp_path)
    value = json.loads(output.read_text())
    pages = value["page_inventory"]
    if mutation == "truncate":
        pages = pages[:2]
    elif mutation == "duplicate":
        pages = [pages[0], pages[0], pages[1]]
    elif mutation == "gap":
        pages = [pages[0], pages[2]]
    elif mutation == "out-of-range":
        pages[-1]["physical_page_number"] = 4
    else:
        pages = pages[1:]
    value["page_inventory"] = pages
    value["verified"]["proposal"]["processed_page_numbers"] = [
        item["physical_page_number"] for item in pages
    ]
    output.write_text(json.dumps(value))
    with pytest.raises(ExtractionImportError):
        verify_cached_extraction(output)


@pytest.mark.parametrize(
    "mutation", ["missing-authority", "false-change", "unrelated-base", "stale-revision"]
)
def test_directory_rejects_invalid_corrigendum_lineage(
    tmp_path: Path, mutation: str
) -> None:
    """Amendment cache must be revision two and explicitly replace the actual base."""
    base_path = import_files(tmp_path)
    base = json.loads(base_path.read_text())
    amendment = deepcopy(base)
    amendment["document"].update(
        document_version_id="amendment-v1",
        role="CORRIGENDUM",
        source_url="https://example.gov/amendment.pdf",
    )
    proposal = amendment["verified"]["proposal"]
    amendment["document_sha256"] = "b" * 64
    proposal["document_sha256"] = "b" * 64
    proposal["revision"] = 2
    evidence = proposal["requirements"]["children"][0]["evidence"][0]
    authority = {
        "actor": "AUTHORITY",
        "disposition": "ACCEPTED",
        "effective_change": True,
        "replaces_document_id": "base-v1",
        "evidence": evidence,
    }
    if mutation == "missing-authority":
        authority = None
    elif mutation == "false-change":
        authority["effective_change"] = False
    elif mutation == "unrelated-base":
        authority["replaces_document_id"] = "other-base"
    else:
        proposal["revision"] = 1
    proposal["authority_statement"] = authority
    (tmp_path / "amendment.json").write_text(json.dumps(amendment))
    with pytest.raises(ExtractionImportError):
        verify_extraction_directory(tmp_path)


def test_directory_accepts_complete_base_to_corrigendum_lineage(tmp_path: Path) -> None:
    """Fixed files verify when revision two explicitly replaces the actual base."""
    base_path = import_files(tmp_path)
    base = json.loads(base_path.read_text())
    amendment = deepcopy(base)
    amendment["document"].update(
        document_version_id="amendment-v1",
        role="CORRIGENDUM",
        source_url="https://example.gov/amendment.pdf",
    )
    amendment["document_sha256"] = "b" * 64
    proposal = amendment["verified"]["proposal"]
    proposal["document_sha256"] = "b" * 64
    proposal["revision"] = 2
    proposal["authority_statement"] = {
        "actor": "AUTHORITY",
        "disposition": "ACCEPTED",
        "effective_change": True,
        "replaces_document_id": "base-v1",
        "evidence": proposal["requirements"]["children"][0]["evidence"][0],
    }
    (tmp_path / "amendment.json").write_text(json.dumps(amendment))
    assert len(verify_extraction_directory(tmp_path)) == 2


def test_directory_rejects_swapped_fixed_filenames(tmp_path: Path) -> None:
    """Role sets cannot compensate for base/amendment files swapped by name."""
    base_path = import_files(tmp_path)
    base = json.loads(base_path.read_text())
    amendment = deepcopy(base)
    base["document"]["role"] = "CORRIGENDUM"
    amendment["document"]["role"] = "BASE_TENDER"
    base_path.write_text(json.dumps(base))
    (tmp_path / "amendment.json").write_text(json.dumps(amendment))
    with pytest.raises(ExtractionImportError):
        verify_extraction_directory(tmp_path)


def test_cache_output_rejects_escape_and_wrong_role_name(tmp_path: Path) -> None:
    """Domain cache output is derived from canonical root and verified document role."""
    assert validate_extraction_output(tmp_path / "base.json", "BASE_TENDER") == (
        tmp_path / "base.json"
    )
    with pytest.raises(ExtractionCachePathError):
        validate_extraction_output(tmp_path / "wrong.json", "BASE_TENDER")
    with pytest.raises(ExtractionCachePathError):
        validate_extraction_output(tmp_path.parent / "base.json", "BASE_TENDER")
