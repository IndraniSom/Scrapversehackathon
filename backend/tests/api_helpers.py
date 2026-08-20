"""Test-only helpers for isolated FastAPI bundle startup."""

import json
import shutil
from hashlib import sha256
from pathlib import Path

from fastapi.testclient import TestClient

from backend.config import Settings
from backend.main import create_app

SOURCE_DEMO = Path(__file__).parents[1] / "data" / "demo"


def copied_demo(tmp_path: Path) -> Path:
    """Copy the complete immutable demo for startup mutation tests."""
    root = tmp_path / "demo"
    shutil.copytree(SOURCE_DEMO, root)
    return root


def client_for(root: Path) -> TestClient:
    """Construct a TestClient whose lifespan loads only the supplied bundle."""
    return TestClient(create_app(Settings(demo_data_dir=root)))


def rewrite_json(path: Path, value: object) -> None:
    """Write one compact deterministic mutation in an isolated test bundle."""
    path.write_text(json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n")


def update_manifest_hash(root: Path, key: str) -> None:
    """Refresh one isolated manifest hash so deeper startup validation executes."""
    manifest_path = root / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    relative = manifest["files"][key]["path"]
    manifest["files"][key]["sha256"] = sha256((root / relative).read_bytes()).hexdigest()
    rewrite_json(manifest_path, manifest)
