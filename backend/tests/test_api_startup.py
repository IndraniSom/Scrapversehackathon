"""FastAPI settings and fail-fast lifespan validation tests."""

import json
from pathlib import Path

import pytest
from api_helpers import client_for, copied_demo, rewrite_json, update_manifest_hash

from backend.artifacts import ArtifactError
from backend.config import Settings


def test_settings_expose_only_data_directory_and_bind_fields(tmp_path: Path) -> None:
    """Runtime settings have no provider, LLM, credential, or URL-fetch inputs."""
    settings = Settings(demo_data_dir=tmp_path)
    assert set(type(settings).model_fields) == {"demo_data_dir", "host", "port"}
    assert settings.host == "127.0.0.1"
    assert settings.port == 8000
    assert "token" not in settings.model_dump_json().lower()
    assert "api_key" not in settings.model_dump_json().lower()


@pytest.mark.parametrize(
    "mutation", ["malformed", "invalid-mode", "false-live", "path-escape"]
)
def test_invalid_bundle_fails_during_startup(tmp_path: Path, mutation: str) -> None:
    """Malformed, dishonest, or escaping artifacts stop lifespan before traffic."""
    root = copied_demo(tmp_path)
    if mutation == "malformed":
        rewrite_json(root / "assessment.json", {})
        update_manifest_hash(root, "assessment")
    elif mutation in {"invalid-mode", "false-live"}:
        path = root / "opportunities.json"
        opportunities = json.loads(path.read_text())
        opportunities["items"][-1]["data_mode"] = (
            "INVALID_MODE" if mutation == "invalid-mode" else "LIVE"
        )
        rewrite_json(path, opportunities)
        update_manifest_hash(root, "opportunities")
    else:
        path = root / "manifest.json"
        manifest = json.loads(path.read_text())
        manifest["files"]["company"]["path"] = "../company-profile.json"
        rewrite_json(path, manifest)
    with pytest.raises(ArtifactError), client_for(root):
        raise AssertionError("startup unexpectedly accepted invalid bundle")


def test_lifespan_loads_bundle_once_for_multiple_requests(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Startup validates once and routes reuse the immutable in-memory bundle."""
    import backend.main as main_module

    original = main_module.load_demo_bundle
    calls = 0

    def counted(path: Path):
        """Count one real bundle load without replacing its validation behavior."""
        nonlocal calls
        calls += 1
        return original(path)

    monkeypatch.setattr(main_module, "load_demo_bundle", counted)
    with client_for(copied_demo(tmp_path)) as client:
        assert client.get("/health/ready").status_code == 200
        assert client.get("/api/v1/opportunities").status_code == 200
        assert client.get("/api/v1/source-proof").status_code == 200
    assert calls == 1
