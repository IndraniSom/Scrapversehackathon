"""Behavioral configuration gates for clean-checkout CI and deployment."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CI = ROOT / ".github/workflows/ci.yml"
DEPLOY = ROOT / ".github/workflows/deploy.yml"


def test_ci_runs_backend_and_security_commands_from_valid_projects() -> None:
    """Require backend working directory and root-tool project selection."""
    text = CI.read_text()
    assert "workflow_call:" in text
    assert text.count("working-directory: backend") >= 3
    assert "uv run --project backend python tools/check_sensitive_patterns.py" in text
    assert "uv run --project backend python tools/check_code_file_lengths.py" in text
    assert "pnpm install --frozen-lockfile" in text
    assert text.count('NEXT_PUBLIC_BIDRADAR_E2E_MODE: "1"') == 2
    assert sum(line.strip() == 'BIDRADAR_E2E_MODE: "1"' for line in text.splitlines()) == 2


def test_ci_enforces_codegen_browser_and_security_gates() -> None:
    """Require generated Convex types, Playwright, and non-swallowed scanners."""
    text = CI.read_text()
    frontend_ignore = (ROOT / "frontend/.gitignore").read_text()
    assert "convex/_generated" not in frontend_ignore
    assert (ROOT / "frontend/convex/_generated/api.d.ts").is_file()
    assert "pnpm exec playwright test" in text
    assert "|| true" not in text
    assert "echo \"checkov done\"" not in text


def test_deploy_workflow_uses_configured_targets_and_installed_tools() -> None:
    """Reject placeholder targets and missing deployment prerequisites."""
    text = DEPLOY.read_text()
    assert "example.com" not in text
    assert "secrets: inherit" in text
    assert "setup-flyctl" in text
    assert "VERCEL_ORG_ID" in text
    assert "VERCEL_PROJECT_ID" in text
    assert "vars.STAGING_FRONTEND_URL" in text
    assert "vars.PRODUCTION_FRONTEND_URL" in text
    assert (ROOT / "backend/fly.toml").is_file()
