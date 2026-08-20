"""Offline consistency tests for committed real provider demo artifacts."""

import json
from collections import Counter
from pathlib import Path

from backend.contracts.source import OpportunitySummary
from backend.source_proof import verify_source_proof

DEMO = Path(__file__).parents[1] / "data" / "demo"


def test_real_proof_verifies_without_network_or_preparation_files() -> None:
    """Committed proof replays exact bytes and normalization with no external state."""
    proof = verify_source_proof(DEMO / "source-proof.json")
    raw_path = DEMO / "raw" / f"{proof.raw_snapshot_sha256}.json"
    assert proof.provider_run_id == "j_mt0i928kyu57telkk"
    assert proof.raw_snapshot_sha256 == (
        "b7ff42dfef9c3a12cd043ee0a23394158d9f9800a12407938a07dccd1ee11aef"
    )
    assert raw_path.stat().st_size == 425


def test_opportunities_contain_one_recorded_row_matching_real_proof() -> None:
    """Seven rows retain source counts and exactly one proof-backed recorded row."""
    proof = verify_source_proof(DEMO / "source-proof.json")
    artifact = json.loads((DEMO / "opportunities.json").read_text())
    items = [OpportunitySummary.model_validate(item) for item in artifact["items"]]
    recorded = [item for item in items if item.data_mode == "RECORDED_BRIGHT_DATA_SNAPSHOT"]
    assert len(items) == artifact["total"] == 7
    assert Counter(item.source for item in items) == {
        "CPPP": 2,
        "WEST_BENGAL": 2,
        "NTPC": 2,
        "ODISHA": 1,
    }
    assert recorded == [proof.normalized_record]
