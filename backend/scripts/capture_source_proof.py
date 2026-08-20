"""Stage one approved provider run, finalize three captures, or verify offline."""

import argparse
import os
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from time import sleep

import httpx
from pydantic import ValidationError

from backend.bright_data import BrightDataScraperStudioClient
from backend.source_attempts import CollectionAttemptSuccess
from backend.source_finalize import finalize_source_proof
from backend.source_paths import (
    StorageBoundaryError,
    repository_source_roots,
    validate_staging_directory,
)
from backend.source_policy import (
    ApprovalError,
    PortalReview,
    validate_collection_inputs,
)
from backend.source_proof import (
    FinalizationError,
    ProofVerificationError,
    verify_source_proof,
)
from backend.source_runs import CollectionLimits, collect_source


@dataclass(frozen=True, slots=True)
class CliOptions:
    """Hold typed non-secret preparation options parsed from the command line."""

    verify_only: Path | None
    collect: str | None
    finalize: list[Path] | None
    chosen_run_id: str | None
    review: Path | None
    staging_directory: Path
    demo_directory: Path
    collector_name: str
    collector_version: str


def _parse_args() -> CliOptions:
    """Parse three exclusive preparation modes without accepting credentials."""
    parser = argparse.ArgumentParser(allow_abbrev=False)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--verify-only", type=Path, metavar="PROOF")
    mode.add_argument("--collect", metavar="URL")
    mode.add_argument("--finalize", nargs=3, type=Path, metavar="CAPTURE")
    parser.add_argument("--chosen-run-id")
    parser.add_argument("--review", type=Path)
    parser.add_argument(
        "--staging-directory", type=Path, default=Path("data/preparation/source-runs")
    )
    parser.add_argument("--demo-directory", type=Path, default=Path("data/demo"))
    parser.add_argument("--collector-name", default="bidradar-ntpc-public-tenders")
    parser.add_argument("--collector-version", default="manual-draft-1")
    values = parser.parse_args()
    return CliOptions(
        verify_only=values.verify_only,
        collect=values.collect,
        finalize=values.finalize,
        chosen_run_id=values.chosen_run_id,
        review=values.review,
        staging_directory=values.staging_directory,
        demo_directory=values.demo_directory,
        collector_name=values.collector_name,
        collector_version=values.collector_version,
    )


def _read_review(path: Path | None) -> PortalReview:
    """Load a closed named-human review required by collection and finalization."""
    if path is None:
        raise ProofVerificationError("--review is required")
    try:
        return PortalReview.model_validate_json(path.read_bytes())
    except (OSError, ValidationError) as error:
        raise ProofVerificationError("review record is missing or invalid") from error


def _verify(path: Path) -> int:
    """Return a safe status after network-free proof verification."""
    try:
        proof = verify_source_proof(path)
    except ProofVerificationError as error:
        return _stop(str(error))
    print(f"VERIFIED provider_run_id={proof.provider_run_id}")
    return 0


def _collect_one(options: CliOptions) -> int:
    """Validate approval before reading runtime credentials and staging one run."""
    try:
        review = _read_review(options.review)
        validate_collection_inputs(
            [{"url": options.collect or ""}], review, datetime.now(UTC)
        )
    except (ApprovalError, ProofVerificationError):
        return _stop("collection approval does not cover input")
    try:
        validate_staging_directory(
            options.staging_directory, repository_source_roots()
        )
    except StorageBoundaryError:
        return _stop("staging must be outside demo")
    token = os.environ.get("BRIGHT_DATA_API_TOKEN")
    collector_id = os.environ.get("BRIGHT_DATA_COLLECTOR_ID")
    if not token or not collector_id:
        return _stop("required provider environment is absent")
    limits = CollectionLimits(
        staging_directory=options.staging_directory,
        collector_name=options.collector_name,
        collector_config_version=options.collector_version,
        review=review,
    )
    with httpx.Client(
        base_url="https://api.brightdata.com",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    ) as http:
        attempt = collect_source(
            BrightDataScraperStudioClient(http, collector_id),
            [{"url": options.collect or ""}],
            lambda: datetime.now(UTC),
            sleep,
            limits,
        )
    if not isinstance(attempt, CollectionAttemptSuccess):
        return _stop(f"collection failed ({attempt.failure_code})")
    print(
        f"STAGED capture={attempt.capture_path} provider_run_id={attempt.provider_run_id} "
        f"started_at={attempt.started_at.isoformat()} "
        f"completed_at={attempt.completed_at.isoformat()} "
        f"raw_snapshot_sha256={attempt.raw_snapshot_sha256}"
    )
    return 0


def _finalize(options: CliOptions) -> int:
    """Finalize exactly three staged captures without credentials or network access."""
    if options.finalize is None or not options.chosen_run_id:
        return _stop("three captures and --chosen-run-id are required")
    try:
        review = _read_review(options.review)
        proof_path = finalize_source_proof(
            options.finalize,
            options.chosen_run_id,
            review,
            options.demo_directory,
        )
    except (FinalizationError, ProofVerificationError) as error:
        return _stop(str(error))
    print(f"FINALIZED proof={proof_path}")
    return 0


def _stop(reason: str) -> int:
    """Print one sanitized stop reason and return the non-success status."""
    print(f"STOP-PROVIDER: {reason}", file=sys.stderr)
    return 2


def main() -> int:
    """Dispatch collect, finalize, or verify-only preparation mode."""
    options = _parse_args()
    if options.verify_only is not None:
        return _verify(options.verify_only)
    if options.collect is not None:
        return _collect_one(options)
    return _finalize(options)


if __name__ == "__main__":
    raise SystemExit(main())
