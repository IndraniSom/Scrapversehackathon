"""Prepare full extraction requests, import reviewed responses, or verify caches."""

import argparse
import sys
from pathlib import Path

from backend.extraction_import import (
    ExtractionImportError,
    import_response_files,
    verify_extraction_directory,
)
from backend.preparation import PreparationError, prepare_extraction_requests
from backend.source_paths import repository_source_roots


def _parse_args() -> argparse.Namespace:
    """Parse exclusive local-only preparation modes without credential options."""
    parser = argparse.ArgumentParser(allow_abbrev=False)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--prepare-requests", type=Path, metavar="SELECTION")
    mode.add_argument("--import-response", type=Path, metavar="RESPONSE")
    mode.add_argument("--verify-only", type=Path, metavar="DIRECTORY")
    parser.add_argument("--private-root", type=Path, default=Path("data/private-demo"))
    parser.add_argument(
        "--request-output", type=Path, default=Path("data/preparation/extraction-requests")
    )
    parser.add_argument("--request", type=Path)
    parser.add_argument("--selection", type=Path)
    parser.add_argument("--review", type=Path)
    parser.add_argument("--pdf", type=Path)
    return parser.parse_args()


def _prepare(selection: Path, options: argparse.Namespace) -> int:
    """Generate complete ignored request JSON for both selected private PDFs."""
    paths = prepare_extraction_requests(
        selection,
        options.request_output,
        options.private_root,
        repository_source_roots(),
    )
    for path in paths:
        print(path)
    return 0


def _import(response: Path, options: argparse.Namespace) -> int:
    """Import one provider envelope only when request/PDF/review all verify."""
    required = (options.selection, options.request, options.review, options.pdf)
    if any(path is None for path in required):
        raise ExtractionImportError(
            "--selection, --request, --review, and --pdf are required"
        )
    path = import_response_files(
        options.selection,
        options.request,
        response,
        options.review,
        options.pdf,
    )
    print(path)
    return 0


def main() -> int:
    """Dispatch local request, response-import, or offline cache-verification mode."""
    options = _parse_args()
    try:
        if options.prepare_requests is not None:
            return _prepare(options.prepare_requests, options)
        if options.import_response is not None:
            return _import(options.import_response, options)
        cached = verify_extraction_directory(options.verify_only)
        print(f"VERIFIED extractions={len(cached)}")
        return 0
    except (ExtractionImportError, PreparationError) as error:
        print(f"STOP-DOCUMENT: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
