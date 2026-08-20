"""Import externally acquired Convex exports into canonical ignored preparation."""

import argparse
from pathlib import Path

from backend.source_convex import ConvexImportError, import_convex_exports
from backend.source_paths import repository_source_roots


def main() -> int:
    """Validate CLI paths and print only non-secret staged capture locations."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--exports", required=True, type=Path)
    parser.add_argument("--metadata", required=True, type=Path)
    parser.add_argument("--review", required=True, type=Path)
    parser.add_argument(
        "--staging-directory",
        type=Path,
        default=Path("data/preparation/source-runs"),
    )
    options = parser.parse_args()
    try:
        paths = import_convex_exports(
            options.exports,
            options.metadata,
            options.review,
            options.staging_directory,
            repository_source_roots(),
        )
    except ConvexImportError as error:
        parser.error(str(error))
    for path in paths:
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
