"""Mutation tests for staged-capture finalization boundaries."""

import json
from pathlib import Path

import pytest
from pydantic import JsonValue
from test_source_finalize import stage_three
from test_source_policy import approved_review

from backend.source_capture import load_staged_capture
from backend.source_finalize import finalize_source_proof
from backend.source_proof import FinalizationError
from backend.source_storage import StorageError


def mutate_capture(path: Path, mutation: str) -> None:
    """Apply one invalid staged-capture mutation with literal expected consequences."""
    data: dict[str, JsonValue] = json.loads(path.read_text())
    if mutation == "review":
        data["review_sha256"] = "0" * 64
    elif mutation == "portal":
        data["portal"] = "CPPP"
    elif mutation == "collector":
        data["collector_name"] = "different"
    elif mutation == "input":
        data["input_urls"] = ["https://evil.example/Index/Search"]
    elif mutation == "raw-membership":
        data["raw_record"]["title"] = "not in raw"
    elif mutation == "normalization":
        data["normalized_record"]["title"] = "not normalized"
    elif mutation == "raw-path":
        data["raw_path"] = f"../{data['raw_snapshot_sha256']}.raw.json"
    elif mutation == "reverse-time":
        data["completed_at"] = "2026-08-20T11:00:00Z"
    elif mutation == "naive-time":
        data["started_at"] = "2026-08-20T12:00:00"
    elif mutation == "empty-id":
        data["provider_run_id"] = ""
    else:
        raise AssertionError(f"unknown mutation: {mutation}")
    path.write_text(json.dumps(data))


@pytest.mark.parametrize(
    "mutation",
    [
        "review",
        "portal",
        "collector",
        "input",
        "raw-membership",
        "normalization",
        "raw-path",
        "reverse-time",
        "naive-time",
        "empty-id",
    ],
)
def test_finalizer_rejects_each_staged_capture_mutation(
    tmp_path: Path, mutation: str
) -> None:
    """Every staged capture invariant is required before any demo publication."""
    captures = stage_three(tmp_path)
    mutate_capture(captures[2], mutation)
    demo = tmp_path / "demo"

    with pytest.raises(FinalizationError):
        finalize_source_proof(captures, "j_run_2", approved_review(), demo)

    assert not demo.exists()


def test_finalizer_rejects_unknown_chosen_id_before_publication(tmp_path: Path) -> None:
    """The chosen provider ID must name exactly one of the three staged captures."""
    demo = tmp_path / "demo"
    with pytest.raises(FinalizationError, match="chosen run"):
        finalize_source_proof(stage_three(tmp_path), "j_missing", approved_review(), demo)
    assert not demo.exists()


def test_staged_model_rejects_portal_source_mismatch(tmp_path: Path) -> None:
    """Capture metadata cannot claim a portal different from its normalized record."""
    capture_path = stage_three(tmp_path)[0]
    data = json.loads(capture_path.read_text())
    data["normalized_record"]["source"] = "CPPP"
    capture_path.write_text(json.dumps(data))
    with pytest.raises(StorageError):
        load_staged_capture(capture_path)
