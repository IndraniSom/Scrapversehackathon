"""Signed tender-intelligence API behavior tests."""

import hashlib
import hmac
import json

from fastapi.testclient import TestClient

from backend.config import Settings
from backend.main import create_app


def test_signed_qa_returns_cited_authorized_paragraph(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    """Q&A endpoint returns bounded source text with exact citation metadata."""
    secret = "worker-secret"
    monkeypatch.setenv("BIDRADAR_WORKER_HMAC_SECRET", secret)
    body = json.dumps({
        "kind": "qa",
        "organizationId": "org_a",
        "opportunityId": "opp_a",
        "question": "What is the EMD amount?",
        "chunks": [{
            "chunk_id": "chunk_a",
            "organization_id": "org_a",
            "opportunity_id": "opp_a",
            "document_id": "doc_a",
            "document_hash": "a" * 64,
            "page_number": 3,
            "text": "The EMD amount is INR 500000.",
        }],
    }, separators=(",", ":")).encode()
    signature = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    with TestClient(create_app(Settings())) as client:
        response = client.post("/internal/v1/tender-intelligence", content=body, headers={"X-Worker-Signature": signature})
    assert response.status_code == 200
    result = response.json()
    assert result["kind"] == "qa"
    assert result["result"]["abstained"] is False
    assert result["result"]["paragraphs"][0]["citations"][0] == {
        "chunk_id": "chunk_a", "document_id": "doc_a", "page_number": 3, "document_hash": "a" * 64,
    }
