"""Signed deterministic proposal-package renderer tests."""

import hashlib
import hmac
import json

from fastapi.testclient import TestClient

from backend.config import Settings
from backend.main import create_app


def test_signed_package_returns_stable_zip_digest(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    """Exact package input returns a verifiable archive and rejects bad HMAC."""
    secret = "package-secret"
    monkeypatch.setenv("BIDRADAR_WORKER_HMAC_SECRET", secret)
    payload = {"proposal_id": "proposal_a", "title": "Tender response", "revision": 1, "sections": [{"title": "Technical response", "body": "Reviewed response", "citation": "Page 4", "order": 0, "state": "LOCKED"}], "compliance_csv": "requirement,status\nreq-1,compliant\n"}
    body = json.dumps(payload, separators=(",", ":")).encode()
    signature = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    with TestClient(create_app(Settings())) as client:
        assert client.post("/internal/v1/proposal-package", content=body, headers={"X-Worker-Signature": "bad"}).status_code == 401
        first = client.post("/internal/v1/proposal-package", content=body, headers={"X-Worker-Signature": signature})
        second = client.post("/internal/v1/proposal-package", content=body, headers={"X-Worker-Signature": signature})
    assert first.status_code == 200
    assert first.json()["digest"] == second.json()["digest"]
    assert first.json()["manifest"].keys() == {"proposal.docx", "compliance.csv"}
