"""Shared isolated E2E configuration for backend tests."""

import pytest


@pytest.fixture(autouse=True)
def explicit_e2e_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep deterministic tests isolated unless a test opts out."""
    monkeypatch.setenv("BIDRADAR_E2E_MODE", "1")
