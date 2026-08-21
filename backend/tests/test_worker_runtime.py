"""Runtime tests for mounted authenticated worker execution."""

import hashlib
import hmac
import json
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from backend import embeddings as embedding_module
from backend.config import Settings
from backend.main import create_app
from backend.worker_auth import clear_store, generate_exchange_token
from backend.worker_contracts import WorkerJobRequest
from backend.worker_routes import clear_jobs, register_job


def _job(kind: str = "EMBEDDING") -> WorkerJobRequest:
    """Build one valid worker job request."""
    return WorkerJobRequest(
        jobId="job_runtime",
        organizationId="org_runtime",
        kind=kind,
        status="DISPATCHED",
        idempotencyKey="runtime-test",
        inputRevision="1",
        inputHashes=["a" * 64],
        attempt=1,
        maxAttempts=3,
        traceId="123e4567-e89b-12d3-a456-426614174000",
        requestedBy="user_runtime",
        createdAt=int(datetime.now(UTC).timestamp()),
    )


@pytest.fixture(autouse=True)
def clean_worker_state(monkeypatch: pytest.MonkeyPatch) -> None:
    """Reset worker registries and enable explicit demo bundle mode."""
    clear_jobs()
    clear_store()
    monkeypatch.setenv("BIDRADAR_DEMO_MODE", "1")


class FakeEmbeddingModel:
    """Test-only 768-dimensional embedding model."""

    def encode(self, texts: list[str], **_options: object) -> list[list[float]]:
        """Return one unit vector per input."""
        return [[1.0, *([0.0] * 767)] for _text in texts]


def test_worker_routes_are_mounted() -> None:
    """Application exposes execute and signed-result endpoints."""
    with TestClient(create_app(Settings())) as client:
        assert client.post("/internal/v1/jobs/missing/execute").status_code == 401
        assert client.post("/internal/v1/jobs/missing/result", json={}).status_code != 404


def test_execute_embedding_job_returns_real_vector(monkeypatch: pytest.MonkeyPatch) -> None:
    """Execute endpoint dispatches embedding work instead of echoing job input."""
    job = _job()
    monkeypatch.setattr(embedding_module, "_model", FakeEmbeddingModel())
    register_job(job, {"text": "cybersecurity tender", "mode": "query"})
    token = generate_exchange_token(job.jobId, job.organizationId)
    with TestClient(create_app(Settings())) as client:
        response = client.post(
            f"/internal/v1/jobs/{job.jobId}/execute",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "SUCCEEDED"
    assert len(payload["output"]["embedding"]) == 768
    assert payload["output"]["modelRevision"].endswith("768-v1")


def test_readiness_fails_closed_without_worker_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    """Production readiness rejects absent worker authentication configuration."""
    monkeypatch.delenv("BIDRADAR_DEMO_MODE", raising=False)
    monkeypatch.delenv("BIDRADAR_WORKER_SECRET", raising=False)
    monkeypatch.delenv("BIDRADAR_WORKER_HMAC_SECRET", raising=False)
    with TestClient(create_app(Settings())) as client:
        response = client.get("/health/ready")
    assert response.status_code == 503


def test_signed_embedding_endpoint_returns_worker_vector(monkeypatch: pytest.MonkeyPatch) -> None:
    """Convex can request embeddings through exact-body signed worker boundary."""
    secret = "worker-hmac-secret"
    monkeypatch.setenv("BIDRADAR_WORKER_HMAC_SECRET", secret)
    monkeypatch.setattr(embedding_module, "_model", FakeEmbeddingModel())
    body = json.dumps({"text": "secure cloud tender", "mode": "query"}, separators=(",", ":")).encode()
    signature = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    with TestClient(create_app(Settings())) as client:
        response = client.post(
            "/internal/v1/embeddings",
            content=body,
            headers={"Content-Type": "application/json", "X-Worker-Signature": signature},
        )
    assert response.status_code == 200
    assert len(response.json()["embedding"]) == 768
