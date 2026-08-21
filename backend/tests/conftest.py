"""Shared explicit deterministic-demo configuration for backend tests."""

import pytest


@pytest.fixture(autouse=True)
def explicit_demo_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep legacy offline tests in explicit demo mode unless a test opts out."""
    monkeypatch.setenv("BIDRADAR_DEMO_MODE", "1")
