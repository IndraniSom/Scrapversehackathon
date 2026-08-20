"""Network-free Convex export import and object-proof integration tests."""

import base64
import json
from hashlib import sha256
from pathlib import Path

import pytest
from pydantic import JsonValue
from test_source_policy import approved_review
from test_source_provider import NTPC_URL, PROVIDER_BYTES

from backend.source_convex import ConvexImportError, import_convex_exports
from backend.source_finalize import finalize_source_proof
from backend.source_paths import SourceStorageRoots
from backend.source_proof import verify_source_proof

RUN_IDS = ("j_synthetic_1", "j_synthetic_2", "j_synthetic_3")


def synthetic_payloads() -> tuple[list[dict[str, JsonValue]], list[dict[str, JsonValue]]]:
    """Return three hand-derived export/metadata pairs for importer mutations."""
    digest = sha256(PROVIDER_BYTES).hexdigest()
    encoded = base64.b64encode(PROVIDER_BYTES).decode()
    exports = [
        {"providerId": run_id, "rawBase64": encoded, "sha256": digest}
        for run_id in RUN_IDS
    ]
    metadata = [
        {
            "provider_run_id": run_id,
            "started_at_ms": 1787168896422 + index * 20_000,
            "completed_at_ms": 1787168906876 + index * 20_000,
            "raw_snapshot_sha256": digest,
            "collector_name": "ntpc-live-tenders",
            "collector_version": "1.0.0",
        }
        for index, run_id in enumerate(RUN_IDS)
    ]
    return exports, metadata


def write_inputs(
    tmp_path: Path,
    exports: list[dict[str, JsonValue]],
    metadata: list[dict[str, JsonValue]],
) -> tuple[Path, Path, Path]:
    """Write synthetic non-secret importer inputs under one isolated directory."""
    exports_path = tmp_path / "exports.json"
    metadata_path = tmp_path / "metadata.json"
    review_path = tmp_path / "review.json"
    exports_path.write_text(json.dumps(exports))
    metadata_path.write_text(json.dumps(metadata))
    review_path.write_text(approved_review().model_dump_json())
    return exports_path, metadata_path, review_path


def import_synthetic(
    tmp_path: Path,
    exports: list[dict[str, JsonValue]],
    metadata: list[dict[str, JsonValue]],
) -> list[Path]:
    """Import synthetic pairs using explicit isolated trusted roots."""
    exports_path, metadata_path, review_path = write_inputs(tmp_path, exports, metadata)
    staging = tmp_path / "preparation"
    roots = SourceStorageRoots(
        preparation_root=staging,
        demo_root=tmp_path / "demo",
    )
    return import_convex_exports(
        exports_path, metadata_path, review_path, staging, roots
    )


def rewrite_raw(
    exports: list[dict[str, JsonValue]],
    metadata: list[dict[str, JsonValue]],
    raw: bytes,
) -> None:
    """Replace one pair's bytes while preserving independent hash consistency."""
    digest = sha256(raw).hexdigest()
    exports[0]["rawBase64"] = base64.b64encode(raw).decode()
    exports[0]["sha256"] = digest
    metadata[0]["raw_snapshot_sha256"] = digest


def test_import_stages_three_objects_then_finalizes_and_verifies(tmp_path: Path) -> None:
    """Three valid pairs stage privately and finalize one exact object proof offline."""
    exports, metadata = synthetic_payloads()
    captures = import_synthetic(tmp_path, exports, metadata)
    assert len(captures) == 3
    assert not (tmp_path / "demo").exists()

    proof_path = finalize_source_proof(
        captures, RUN_IDS[2], approved_review(), tmp_path / "demo"
    )
    proof = verify_source_proof(proof_path)
    assert proof.provider_run_id == RUN_IDS[2]
    assert proof.raw_record["sourceTenderId"] == "NTPC-REAL-1"
    assert proof.normalized_record.source == "NTPC"
    assert (tmp_path / "demo" / "raw" / f"{proof.raw_snapshot_sha256}.json").read_bytes() == PROVIDER_BYTES


@pytest.mark.parametrize(
    "mutation",
    [
        "count",
        "id",
        "base64",
        "hash",
        "time",
        "collector",
        "input",
        "response",
        "review",
    ],
)
def test_import_rejects_each_invalid_pair_before_staging(
    tmp_path: Path, mutation: str
) -> None:
    """Every closed import invariant is validated before any preparation write."""
    exports, metadata = synthetic_payloads()
    if mutation == "count":
        exports.pop()
    elif mutation == "id":
        exports[0]["providerId"] = "j_other"
    elif mutation == "base64":
        exports[0]["rawBase64"] = "not base64!"
    elif mutation == "hash":
        exports[0]["sha256"] = "0" * 64
    elif mutation == "time":
        metadata[0]["completed_at_ms"] = 1
    elif mutation == "collector":
        metadata[2]["collector_version"] = "2.0.0"
    elif mutation == "input":
        value = json.loads(PROVIDER_BYTES)
        value["input"]["url"] = f"{NTPC_URL}?unexpected=1"
        rewrite_raw(exports, metadata, json.dumps(value).encode())
    elif mutation == "response":
        rewrite_raw(exports, metadata, b'{"status":"building"}')
    elif mutation == "review":
        pass
    else:
        raise AssertionError(mutation)
    exports_path, metadata_path, review_path = write_inputs(tmp_path, exports, metadata)
    if mutation == "review":
        review = approved_review().model_copy(update={"decision": "LEGAL_VERIFY"})
        review_path.write_text(review.model_dump_json())
    staging = tmp_path / "preparation"
    roots = SourceStorageRoots(preparation_root=staging, demo_root=tmp_path / "demo")
    with pytest.raises(ConvexImportError):
        import_convex_exports(exports_path, metadata_path, review_path, staging, roots)
    assert not staging.exists()
