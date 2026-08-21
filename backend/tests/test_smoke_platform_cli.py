"""Smoke CLI must distinguish normal live failure from explicit offline replay."""

import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_normal_smoke_fails_when_live_services_are_unreachable() -> None:
    """Normal mode cannot report PASS when frontend/backend probes fail."""
    env = os.environ | {
        "BIDRADAR_API_BASE_URL": "http://127.0.0.1:9",
        "BIDRADAR_FRONTEND_URL": "http://127.0.0.1:9",
    }
    result = subprocess.run(
        ["uv", "run", "--project", "backend", "python", "tools/smoke_platform.py"],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 1
    assert "live probes failed" in result.stdout


def test_offline_smoke_skips_live_probes_explicitly() -> None:
    """Offline mode validates replay without trying live services."""
    env = {key: value for key, value in os.environ.items() if key not in {"BRIGHT_DATA_API_TOKEN", "BRIGHT_DATA_COLLECTOR_ID", "DEEPSEEK_API_KEY", "OPENAI_API_KEY"}}
    result = subprocess.run(
        ["uv", "run", "--project", "backend", "python", "tools/smoke_platform.py", "--mode", "offline"],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0
    assert "offline replay" in result.stdout
