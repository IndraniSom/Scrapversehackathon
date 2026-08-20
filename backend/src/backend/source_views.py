"""Explicit factories for complete frozen public source-proof branches."""

from datetime import datetime
from typing import Literal

from pydantic import JsonValue

from backend.contracts.source import (
    OpportunitySummary,
    StoredVerifiedSourceProof,
    UnavailableSourceProof,
    VerifiedSourceProof,
)


def build_verified_source_proof(
    collector_name: str,
    collector_config_version: str,
    provider_run_id: str,
    started_at: datetime,
    completed_at: datetime,
    raw_snapshot_sha256: str,
    raw_record: dict[str, JsonValue],
    normalized_record: OpportunitySummary,
) -> StoredVerifiedSourceProof:
    """Build a complete bounded VERIFIED proof for persisted finalization."""
    return StoredVerifiedSourceProof(
        status="VERIFIED",
        data_mode="RECORDED_BRIGHT_DATA_SNAPSHOT",
        reason_code=None,
        collector_name=collector_name,
        collector_config_version=collector_config_version,
        provider_run_id=provider_run_id,
        started_at=started_at,
        completed_at=completed_at,
        raw_snapshot_sha256=raw_snapshot_sha256,
        raw_record=raw_record,
        normalized_record=normalized_record,
        terminal_state="SUCCESS",
        failure_code=None,
    )


def build_public_verified_source_proof(
    proof: StoredVerifiedSourceProof,
) -> VerifiedSourceProof:
    """Map one bounded stored proof explicitly to the complete frozen public view."""
    return VerifiedSourceProof(
        status=proof.status,
        data_mode=proof.data_mode,
        reason_code=proof.reason_code,
        collector_name=proof.collector_name,
        collector_config_version=proof.collector_config_version,
        provider_run_id=proof.provider_run_id,
        started_at=proof.started_at,
        completed_at=proof.completed_at,
        raw_snapshot_sha256=proof.raw_snapshot_sha256,
        raw_record=proof.raw_record,
        normalized_record=proof.normalized_record,
        terminal_state=proof.terminal_state,
        failure_code=proof.failure_code,
    )


def build_unavailable_source_proof(
    reason_code: Literal[
        "NOT_CONFIGURED",
        "LEGAL_VERIFY_REQUIRED",
        "PROVIDER_UNAVAILABLE",
        "PROOF_NOT_CAPTURED",
    ],
) -> UnavailableSourceProof:
    """Build a complete UNAVAILABLE branch with every provider field explicitly null."""
    return UnavailableSourceProof(
        status="UNAVAILABLE",
        data_mode="MANUAL_FIXTURE",
        reason_code=reason_code,
        collector_name=None,
        collector_config_version=None,
        provider_run_id=None,
        started_at=None,
        completed_at=None,
        raw_snapshot_sha256=None,
        raw_record=None,
        normalized_record=None,
        terminal_state=None,
        failure_code=None,
    )
