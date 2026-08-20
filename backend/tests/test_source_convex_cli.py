"""Command-line safety tests for network-free Convex export import."""

import os
import subprocess
from pathlib import Path

from test_source_convex import synthetic_payloads, write_inputs


def test_import_cli_sanitizes_epoch_overflow_without_staging(tmp_path: Path) -> None:
    """Overflow exits through argparse without traceback or preparation writes."""
    exports, metadata = synthetic_payloads()
    metadata[0]["started_at_ms"] = 10**30
    metadata[0]["completed_at_ms"] = 10**30 + 1
    exports_path, metadata_path, review_path = write_inputs(tmp_path, exports, metadata)
    backend = Path(__file__).parents[1]
    staging = backend / "data" / "preparation" / "overflow-test"
    environment = {
        key: value
        for key, value in os.environ.items()
        if key not in {"BRIGHT_DATA_API_TOKEN", "BRIGHT_DATA_COLLECTOR_ID"}
    }
    result = subprocess.run(
        [
            str(backend / ".venv" / "bin" / "python"),
            str(backend / "scripts" / "import_convex_source.py"),
            "--exports",
            str(exports_path),
            "--metadata",
            str(metadata_path),
            "--review",
            str(review_path),
            "--staging-directory",
            str(staging),
        ],
        cwd=backend,
        env=environment,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 2
    assert "Traceback" not in result.stderr
    assert "Convex import inputs are missing or invalid" in result.stderr
    assert not staging.exists()
