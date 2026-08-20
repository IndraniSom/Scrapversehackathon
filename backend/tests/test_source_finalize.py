"""Three-run source-proof finalization tests."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from source_helpers import RAW_BYTES, RAW_RECORD
from test_source_policy import NTPC_INPUT, approved_review

from backend.source_capture import stage_completed_run
from backend.source_finalize import finalize_source_proof
from backend.source_proof import FinalizationError, verify_source_proof
from backend.source_runs import normalize_record


def stage_three(tmp_path: Path) -> list[Path]:
    """Stage three literal successful captures without provider or demo publication."""
    review = approved_review()
    started = datetime(2026, 8, 20, 12, tzinfo=UTC)
    paths: list[Path] = []
    for index in range(3):
        attempt = stage_completed_run(
            tmp_path / "preparation",
            review,
            [NTPC_INPUT],
            "ntpc-public-tenders",
            "v1",
            f"j_run_{index + 1}",
            started + timedelta(minutes=index),
            started + timedelta(minutes=index, seconds=30),
            RAW_BYTES,
            RAW_RECORD,
            normalize_record(
                RAW_RECORD,
                "5484fda9a8e072d97d650e9ebcaf30ea0e1a31b868ce1c4413625963491bccc5",
            ),
        )
        paths.append(attempt.capture_path)
    return paths


def test_finalizer_promotes_only_chosen_bytes_after_three_valid_captures(
    tmp_path: Path,
) -> None:
    """A full three-run gate atomically publishes one raw file and one proof artifact."""
    captures = stage_three(tmp_path)
    demo = tmp_path / "demo"

    proof_path = finalize_source_proof(
        captures, "j_run_2", approved_review(), demo
    )
    proof = verify_source_proof(proof_path)

    assert proof.provider_run_id == "j_run_2"
    assert proof.reason_code is None
    assert len(list((demo / "raw").glob("*.json"))) == 1
    assert next((demo / "raw").glob("*.json")).read_bytes() == RAW_BYTES


@pytest.mark.parametrize(
    "capture_selector",
    [
        lambda paths: paths[:2],
        lambda paths: [paths[0], paths[0], paths[2]],
    ],
)
def test_finalizer_rejects_incomplete_or_duplicate_runs_before_publication(
    tmp_path: Path, capture_selector: Callable[[list[Path]], list[Path]]
) -> None:
    """Anything other than three distinct completed runs leaves demo storage absent."""
    captures = capture_selector(stage_three(tmp_path))
    demo = tmp_path / "demo"

    with pytest.raises(FinalizationError):
        finalize_source_proof(captures, "j_run_2", approved_review(), demo)

    assert not demo.exists()


def test_finalizer_rejects_tampered_staged_bytes_before_publication(
    tmp_path: Path,
) -> None:
    """A staged raw-byte mismatch blocks both chosen raw and proof publication."""
    captures = stage_three(tmp_path)
    raw_path = next((tmp_path / "preparation").glob("*.raw.json"))
    raw_path.write_bytes(b"[]")
    demo = tmp_path / "demo"

    with pytest.raises(FinalizationError, match="staged raw"):
        finalize_source_proof(captures, "j_run_2", approved_review(), demo)

    assert not demo.exists()
