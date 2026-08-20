"""Command-line workflow tests for staged provider proof preparation."""

import os
import subprocess
from pathlib import Path

from test_source_finalize import stage_three
from test_source_policy import approved_review

BACKEND = Path(__file__).parents[1]
SCRIPT = BACKEND / "scripts" / "capture_source_proof.py"
PYTHON = BACKEND / ".venv" / "bin" / "python"


def environment_without_provider_credentials() -> dict[str, str]:
    """Return a child environment with both provider variables explicitly absent."""
    return {
        key: value
        for key, value in os.environ.items()
        if key not in {"BRIGHT_DATA_API_TOKEN", "BRIGHT_DATA_COLLECTOR_ID"}
    }


def write_review(path: Path, portal: str = "NTPC") -> Path:
    """Write one closed named-human review for CLI behavior tests."""
    path.write_text(approved_review(portal).model_dump_json(indent=2))
    return path


def run_cli(arguments: list[str]) -> subprocess.CompletedProcess[str]:
    """Run the preparation CLI without provider credentials or shell expansion."""
    return subprocess.run(
        [str(PYTHON), str(SCRIPT), *arguments],
        cwd=BACKEND,
        env=environment_without_provider_credentials(),
        check=False,
        capture_output=True,
        text=True,
    )


def test_collect_rejects_input_mismatch_before_credential_check(tmp_path: Path) -> None:
    """An uncovered target stops locally even when provider credentials are absent."""
    review = write_review(tmp_path / "review.json", "CPPP")
    result = run_cli(
        [
            "--collect",
            "https://ntpctender.ntpc.co.in/Index/Search?Type=Reg&Region=1",
            "--review",
            str(review),
            "--staging-directory",
            str(tmp_path / "preparation"),
        ]
    )
    assert result.returncode == 2
    assert result.stderr.strip() == "STOP-PROVIDER: collection approval does not cover input"
    assert not (tmp_path / "preparation").exists()


def test_valid_collect_without_credentials_stops_before_network(tmp_path: Path) -> None:
    """A covered input still requires externally supplied runtime credentials."""
    review = write_review(tmp_path / "review.json")
    result = run_cli(
        [
            "--collect",
            "https://ntpctender.ntpc.co.in/Index/Search?Type=Reg&Region=1",
            "--review",
            str(review),
        ]
    )
    assert result.returncode == 2
    assert result.stderr.strip() == (
        "STOP-PROVIDER: required provider environment is absent"
    )


def test_collect_rejects_staging_inside_demo_before_credentials(tmp_path: Path) -> None:
    """Preparation captures cannot be redirected into any demo publication directory."""
    review = write_review(tmp_path / "review.json")
    demo = tmp_path / "demo"
    result = run_cli(
        [
            "--collect",
            "https://ntpctender.ntpc.co.in/Index/Search?Type=Reg&Region=1",
            "--review",
            str(review),
            "--staging-directory",
            str(demo / "raw"),
            "--demo-directory",
            str(demo),
        ]
    )
    assert result.returncode == 2
    assert result.stderr.strip() == "STOP-PROVIDER: staging must be outside demo"
    assert not demo.exists()


def test_finalize_consumes_three_captures_without_credentials(tmp_path: Path) -> None:
    """The finalizer publishes verified proof using only staged non-secret inputs."""
    captures = stage_three(tmp_path)
    review = write_review(tmp_path / "review.json")
    demo = tmp_path / "demo"
    result = run_cli(
        [
            "--finalize",
            *(str(path) for path in captures),
            "--chosen-run-id",
            "j_run_2",
            "--review",
            str(review),
            "--demo-directory",
            str(demo),
        ]
    )
    assert result.returncode == 0
    assert result.stdout.strip() == f"FINALIZED proof={demo / 'source-proof.json'}"
    assert (demo / "source-proof.json").is_file()
