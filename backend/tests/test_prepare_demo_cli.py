"""CLI containment tests for reviewed extraction cache import."""

import subprocess
from pathlib import Path


def test_import_cli_has_no_operator_selected_output_path(tmp_path: Path) -> None:
    """An arbitrary --output argument is rejected before any cache-shaped write."""
    backend = Path(__file__).parents[1]
    forbidden = tmp_path / "forbidden.json"
    result = subprocess.run(
        [
            str(backend / ".venv" / "bin" / "python"),
            str(backend / "scripts" / "prepare_demo.py"),
            "--import-response",
            str(tmp_path / "response.json"),
            "--output",
            str(forbidden),
        ],
        cwd=backend,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 2
    assert "unrecognized arguments: --output" in result.stderr
    assert not forbidden.exists()
