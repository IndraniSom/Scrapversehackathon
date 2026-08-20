"""Three-run validation and gated demo proof publication."""

import json
from collections.abc import Sequence
from hashlib import sha256
from pathlib import Path

from pydantic import ValidationError

from backend.source_capture import StagedCapture, load_staged_capture, review_digest
from backend.source_policy import (
    ApprovalError,
    PortalReview,
    validate_collection_inputs,
)
from backend.source_proof import (
    FinalizationError,
    ProviderRunMetadata,
    SourceProofArtifact,
)
from backend.source_provider import decode_provider_records, normalize_supported_record
from backend.source_storage import StorageError, atomic_install
from backend.source_views import build_verified_source_proof


def finalize_source_proof(
    capture_paths: Sequence[Path],
    chosen_run_id: str,
    review: PortalReview,
    demo_directory: Path,
) -> Path:
    """Validate exactly three staged runs before publishing chosen bytes and proof."""
    captures = _load_gate(capture_paths, review)
    chosen = next(
        (capture for capture in captures if capture.provider_run_id == chosen_run_id),
        None,
    )
    if chosen is None:
        raise FinalizationError("chosen run is not one of the three captures")
    chosen_raw = _validated_raw(capture_paths[captures.index(chosen)], chosen)
    proof = build_verified_source_proof(
        chosen.collector_name,
        chosen.collector_config_version,
        chosen.provider_run_id,
        chosen.started_at,
        chosen.completed_at,
        chosen.raw_snapshot_sha256,
        chosen.raw_record,
        chosen.normalized_record,
    )
    artifact = SourceProofArtifact(
        collector_name=chosen.collector_name,
        collector_config_version=chosen.collector_config_version,
        runs=[
            ProviderRunMetadata(
                provider_run_id=capture.provider_run_id,
                terminal_state="SUCCESS",
                started_at=capture.started_at,
                completed_at=capture.completed_at,
                failure_code=None,
            )
            for capture in captures
        ],
        chosen_proof_id=chosen.provider_run_id,
        source_review=review,
        raw_snapshot_path=f"raw/{chosen.raw_snapshot_sha256}.json",
        proof=proof,
    )
    artifact_bytes = (
        json.dumps(artifact.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
        + "\n"
    ).encode()
    try:
        atomic_install(
            demo_directory / "raw",
            f"{chosen.raw_snapshot_sha256}.json",
            chosen_raw,
        )
        return atomic_install(demo_directory, "source-proof.json", artifact_bytes)
    except StorageError as error:
        raise FinalizationError("proof publication failed") from error


def _load_gate(
    capture_paths: Sequence[Path], review: PortalReview
) -> list[StagedCapture]:
    """Load and cross-check all three captures without writing demo artifacts."""
    if len(capture_paths) != 3:
        raise FinalizationError("exactly three captures are required")
    try:
        captures = [load_staged_capture(path) for path in capture_paths]
    except StorageError as error:
        raise FinalizationError("staged capture is missing or invalid") from error
    if len({capture.provider_run_id for capture in captures}) != 3:
        raise FinalizationError("three distinct provider runs are required")
    expected_review = review_digest(review)
    expected_collector = {
        (capture.collector_name, capture.collector_config_version)
        for capture in captures
    }
    if len(expected_collector) != 1:
        raise FinalizationError("collector metadata differs across captures")
    for path, capture in zip(capture_paths, captures, strict=True):
        if capture.review_sha256 != expected_review or capture.portal != review.portal:
            raise FinalizationError("capture review does not match approval")
        try:
            validate_collection_inputs(
                [{"url": url} for url in capture.input_urls], review, capture.started_at
            )
            _validated_raw(path, capture)
        except ApprovalError as error:
            raise FinalizationError("capture input does not match approval") from error
    return captures


def _validated_raw(capture_path: Path, capture: StagedCapture) -> bytes:
    """Verify staged bytes, embedded record membership, and normalization replay."""
    raw_path = capture_path.parent / capture.raw_path
    try:
        raw_bytes = raw_path.read_bytes()
        records = decode_provider_records(raw_bytes)
        normalized = normalize_supported_record(
            capture.raw_record, capture.raw_snapshot_sha256
        )
    except (OSError, ValidationError, ValueError) as error:
        raise FinalizationError("staged raw data is missing or invalid") from error
    if len(raw_bytes) != capture.raw_length:
        raise FinalizationError("staged raw length mismatch")
    if sha256(raw_bytes).hexdigest() != capture.raw_snapshot_sha256:
        raise FinalizationError("staged raw hash mismatch")
    if capture.raw_record not in records or normalized != capture.normalized_record:
        raise FinalizationError("staged raw normalization mismatch")
    return raw_bytes
