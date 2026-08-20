"""Mutation tests for every persisted source-proof integrity boundary."""

import json
import shutil
from pathlib import Path

import pytest
from pydantic import JsonValue
from test_source_finalize import stage_three
from test_source_policy import approved_review

from backend.source_finalize import finalize_source_proof
from backend.source_proof import ProofVerificationError, verify_source_proof


def mutate_artifact(
    data: dict[str, JsonValue], mutation: str, proof_path: Path
) -> None:
    """Apply one literal invalid proof mutation without production helpers."""
    digest = data["proof"]["raw_snapshot_sha256"]
    if mutation == "alternate-layout":
        alternate = proof_path.parent / "other" / f"{digest}.json"
        alternate.parent.mkdir()
        shutil.copyfile(proof_path.parent / "raw" / f"{digest}.json", alternate)
        data["raw_snapshot_path"] = f"other/{digest}.json"
    elif mutation == "normalized-layout":
        data["raw_snapshot_path"] = f"raw/../raw/{digest}.json"
    elif mutation == "duplicate-run":
        data["runs"][1]["provider_run_id"] = data["runs"][0]["provider_run_id"]
    elif mutation == "empty-run-id":
        data["runs"][2]["provider_run_id"] = ""
    elif mutation == "overlong-run-id":
        data["runs"][2]["provider_run_id"] = "x" * 257
    elif mutation == "missing-chosen":
        data["chosen_proof_id"] = "j_missing"
    elif mutation == "collector-mismatch":
        data["proof"]["collector_name"] = "different-collector"
    elif mutation == "raw-membership":
        data["proof"]["raw_record"]["title"] = "not in raw bytes"
    elif mutation == "normalization":
        data["proof"]["normalized_record"]["title"] = "wrong normalized title"
    elif mutation == "unsafe-opportunity-id":
        data["proof"]["normalized_record"]["id"] = "."
    elif mutation == "reverse-time":
        data["runs"][2]["completed_at"] = "2026-08-20T11:00:00Z"
    elif mutation == "naive-time":
        data["runs"][2]["started_at"] = "2026-08-20T12:02:00"
    elif mutation == "empty-reviewer":
        data["source_review"]["reviewer"] = ""
    elif mutation == "overlong-reviewer":
        data["source_review"]["reviewer"] = "x" * 257
    elif mutation == "http-policy":
        data["source_review"]["policy_url"] = (
            "http://ntpctender.ntpc.co.in/Index/Disclaimer"
        )
    elif mutation == "future-review":
        data["source_review"]["reviewed_at"] = "2027-01-01"
    elif mutation == "portal-review-mismatch":
        data["source_review"]["portal"] = "CPPP"
        data["source_review"]["policy_url"] = (
            "https://www.eprocure.gov.in/eprocure/app?page=Disclaimer&service=page"
        )
    else:
        raise AssertionError(f"unknown mutation: {mutation}")


@pytest.mark.parametrize(
    "mutation",
    [
        "alternate-layout",
        "normalized-layout",
        "duplicate-run",
        "empty-run-id",
        "overlong-run-id",
        "missing-chosen",
        "collector-mismatch",
        "raw-membership",
        "normalization",
        "unsafe-opportunity-id",
        "reverse-time",
        "naive-time",
        "empty-reviewer",
        "overlong-reviewer",
        "http-policy",
        "future-review",
        "portal-review-mismatch",
    ],
)
def test_verify_source_proof_rejects_each_integrity_mutation(
    tmp_path: Path, mutation: str
) -> None:
    """Removing any claimed proof invariant makes offline verification fail."""
    proof_path = finalize_source_proof(
        stage_three(tmp_path), "j_run_2", approved_review(), tmp_path / "demo"
    )
    data: dict[str, JsonValue] = json.loads(proof_path.read_text())
    mutate_artifact(data, mutation, proof_path)
    proof_path.write_text(json.dumps(data))

    with pytest.raises(ProofVerificationError):
        verify_source_proof(proof_path)
