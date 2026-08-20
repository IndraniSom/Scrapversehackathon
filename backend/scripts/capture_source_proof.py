"""Prepare one approved provider run or verify an existing proof offline."""

import argparse
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from time import sleep

import httpx

from backend.bright_data import BrightDataScraperStudioClient
from backend.source_proof import ProofVerificationError, verify_source_proof
from backend.source_runs import CollectionLimits, PortalReview, collect_source


def _parse_args() -> argparse.Namespace:
    """Parse verification or single-run preparation options without accepting secrets."""
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--verify-only", type=Path, metavar="PROOF")
    mode.add_argument("--input-url")
    parser.add_argument("--review", type=Path)
    parser.add_argument("--raw-directory", type=Path, default=Path("data/demo/raw"))
    parser.add_argument("--collector-name", default="bidradar-ntpc-public-tenders")
    parser.add_argument("--collector-version", default="manual-draft-1")
    return parser.parse_args()


def _verify(path: Path) -> int:
    """Return a safe status code after network-free proof verification."""
    try:
        proof = verify_source_proof(path)
    except ProofVerificationError as error:
        print(f"STOP-PROVIDER: {error}", file=sys.stderr)
        return 2
    print(f"VERIFIED provider_run_id={proof.provider_run_id}")
    return 0


def _read_review(path: Path | None) -> PortalReview:
    """Load the human-authored closed review record required before collection."""
    if path is None:
        raise ProofVerificationError("--review is required for collection")
    try:
        return PortalReview.model_validate_json(path.read_bytes())
    except (OSError, ValueError) as error:
        raise ProofVerificationError("review record is missing or invalid") from error


def _collect_one(args: argparse.Namespace) -> int:
    """Read credentials only at runtime and print non-secret single-run metadata."""
    token = os.environ.get("BRIGHT_DATA_API_TOKEN")
    collector_id = os.environ.get("BRIGHT_DATA_COLLECTOR_ID")
    if not token or not collector_id:
        print("STOP-PROVIDER: required provider environment is absent", file=sys.stderr)
        return 2
    try:
        review = _read_review(args.review)
    except ProofVerificationError as error:
        print(f"STOP-PROVIDER: {error}", file=sys.stderr)
        return 2
    limits = CollectionLimits(
        max_polls=36,
        poll_interval_seconds=5,
        raw_directory=args.raw_directory,
        collector_name=args.collector_name,
        collector_config_version=args.collector_version,
        review=review,
    )
    headers = {"Authorization": f"Bearer {token}"}
    with httpx.Client(
        base_url="https://api.brightdata.com", headers=headers, timeout=30
    ) as http:
        proof = collect_source(
            BrightDataScraperStudioClient(http, collector_id),
            [{"url": args.input_url, "legal_decision": "ALLOW"}],
            lambda: datetime.now(UTC),
            sleep,
            limits,
        )
    print(
        f"status={proof.status} provider_run_id={proof.provider_run_id} "
        f"terminal_state={proof.terminal_state} failure_code={proof.failure_code}"
    )
    return 0 if proof.status == "VERIFIED" else 2


def main() -> int:
    """Dispatch offline verification or one externally authorized preparation run."""
    args = _parse_args()
    if args.verify_only is not None:
        return _verify(args.verify_only)
    return _collect_one(args)


if __name__ == "__main__":
    raise SystemExit(main())
